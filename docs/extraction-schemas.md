# Esquemas de extracción (boletas y recibos)

Cómo funciona la lectura automática de PDFs y fotos:

1. La PWA sube el archivo a `POST /api/documents/parse` (multipart: `file`, `kind` = `bill` | `payslip`).
   Formatos: PDF, JPG, PNG, GIF y WEBP.
2. El server guarda el original en `documents` (base64, hasta 4 MB; las fotos se achican en el celu).
3. Lo lee de una de dos formas:
   - **Con IA** (si hay `ANTHROPIC_API_KEY`): Claude con salida estructurada (`src/lib/extraction/claude-extractor.ts`).
   - **Gratis** (sin key): saca el texto del PDF con `unpdf` y busca etiquetas habituales
     ("Total a pagar", "1º Vencimiento", "Período", "Neto a cobrar", …) en `src/lib/parsers/text-extraction.ts`.
     Funciona con PDFs digitales (los que manda la empresa); no con fotos ni PDFs escaneados, que se
     completan a mano con el original guardado.
4. `bill-parser.ts` / `payslip-parser.ts` normalizan montos (`"1.234,56"` → centavos), fechas
   (`dd/mm/aaaa` → ISO), períodos (`"Noviembre 2026"` → `2026-11`) y detectan el proveedor.
5. La PWA muestra una **pantalla de confirmación** editable con advertencias; recién al confirmar
   se guarda la boleta (con el JSON extraído en `raw_extracted_json`) o el recibo.

Si se cancela la revisión, el original se borra. El original de cada boleta o recibo confirmado se ve
con el link "Original" (`GET /api/documents/[id]`). También acepta `application/json`
`{ "kind": "bill" | "payslip", "extraction": { … } }` para normalizar una extracción hecha afuera.

## Reglas para el modelo

- Devolver los montos **tal cual aparecen impresos** (como string). La conversión la hace el parser.
- Si un campo no aparece, `null`. No inventar.
- `confianza` entre 0 y 1. Por debajo de 0,7 la app pide revisar.

## Boleta de servicio (`billExtraction`)

| Campo | Tipo | Ejemplo | Notas |
|---|---|---|---|
| `emisor` | string | `"Camuzzi Gas Pampeana S.A."` | Se mapea a `EDES`, `CAMUZZI`, `BVC`, `PERSONAL` u `OTRO` |
| `numero_cliente` | string \| null | `"0123456"` | |
| `periodo` | string \| null | `"10/2026"`, `"Octubre 2026"` | Si falta se usa el mes del vencimiento |
| `fecha_emision` | string \| null | `"02/11/2026"` | |
| `vencimiento` | string | `"18/11/2026"` | Primer vencimiento. Obligatorio |
| `segundo_vencimiento` | string \| null | `"28/11/2026"` | |
| `monto` | string | `"$ 45.320,50"` | Total a pagar al primer vencimiento |
| `moneda` | string | `"ARS"` | |
| `confianza` | number | `0.92` | |

## Recibo de sueldo (`payslipExtraction`)

| Campo | Tipo | Notas |
|---|---|---|
| `empleador` | string \| null | |
| `periodo` | string \| null | Mes liquidado |
| `fecha_pago` | string \| null | |
| `categoria` | string \| null | Ej. `"Auxiliar C"` |
| `haberes` | `{ concepto, monto, remunerativo }[]` | Incluye básico, antigüedad, presentismo, sumas no remunerativas |
| `descuentos` | `{ concepto, monto }[]` | Jubilación, ley 19.032, obra social, sindicato, ganancias, etc. |
| `total_remunerativo` | string \| null | Para control cruzado |
| `total_no_remunerativo` | string \| null | Para control cruzado |
| `total_descuentos` | string \| null | Para control cruzado |
| `neto` | string | Obligatorio |
| `confianza` | number | |

El parser suma las líneas y avisa si no coinciden con los totales impresos o si
haberes − descuentos ≠ neto (tolerancia: $1).
