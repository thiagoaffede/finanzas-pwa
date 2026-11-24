# Reglas de negocio

Este documento explica cómo calcula la app. El código vive en `src/lib/finance/` y cada
regla tiene tests en el archivo `*.test.ts` de al lado (`npm test`).

> **Importante — valores de referencia.** La app **no** trae cargadas escalas salariales,
> sumas no remunerativas, porcentajes de aportes ni índices oficiales. Lo que aparece en
> pantalla mientras no haya base de datos son **datos de ejemplo** (`src/lib/demo-data.ts`).
> Antes de confiar en un número:
> - cargá la escala vigente de Empleados de Comercio en `payroll_scales` (con su vigencia),
> - revisá los porcentajes de `DEFAULT_COMMERCE_CONFIG` contra el acuerdo vigente,
> - cargá ICL (BCRA) e IPC (INDEC) reales en `index_values`.

## Convenciones

| Qué | Cómo |
|---|---|
| Plata | Entero en **centavos** (`bigint` en la base, `number` entero en TS). Nunca floats. |
| Redondeo | Al centavo con `Math.round` en cada multiplicación (`mulCents`). |
| Cuotas | `splitCents` reparte el total sin perder centavos (el resto va a las primeras). |
| Fechas | `YYYY-MM-DD` / `YYYY-MM` como string. Sin `Date` con zona horaria. "Hoy" = Argentina (UTC−3). |
| Tasas | Fracción decimal: `0.03` = 3 %. Mensual salvo que diga anual. |

## Cuánto puedo gastar (`safe-to-spend.ts`)

```
Disponible del mes = Ingreso neto − Vencimientos y cuotas del mes − Aporte a objetivos − Colchón
Restante           = Disponible del mes − Gasto variable ya hecho
Por día            = Restante / días que quedan (incluye hoy)
Por semana         = min(Restante, Por día × 7)
```

- El ingreso neto es el del recibo liquidado si existe; si no, el estimado por convenio.
- Solo cuentan los vencimientos con fecha dentro del mes actual (pagados o no).
- Estado: **Te pasaste** si el restante es negativo; **Ajustado** si gastaste más de 10 % por encima
  del ritmo ideal (disponible × días transcurridos / días del mes) o te queda menos del 10 %.
- Las compras con tarjeta y en cuotas no se suman al gasto variable: ya figuran como obligación
  (resumen o cuota) en el mes en que se pagan.
- Lo que te deben de un gasto compartido se descuenta del gasto propio.

## Sueldo — Empleados de Comercio, Auxiliar C (`commerce-union.ts`)

**Escala por vigencia.** `payroll_scales` guarda `category`, `valid_from`, `valid_to` (o vacío =
vigente), `basic_cents` y `non_remunerative_cents`. Para un período se usa la fila vigente en esa
fecha; si hay superposición, gana la de `valid_from` más reciente.

**Cálculo** (todo configurable en `CommerceUnionConfig`):

| Concepto | Regla por defecto | Configurable |
|---|---|---|
| Básico | Escala × (horas semanales / 48) | `fullTimeWeeklyHours` |
| Antigüedad | 1 % del básico por año **completo** | `seniorityRatePerYear` |
| Presentismo | 1/12 de (básico + antigüedad) si cumple | `presentismoRate` |
| Sumas no remunerativas | Las del acuerdo vigente, con antigüedad y presentismo | `seniorityOnNonRemunerative`, `presentismoOnNonRemunerative` |
| Jubilación | 11 % sobre remunerativo | `deductions` |
| Ley 19.032 (PAMI) | 3 % sobre remunerativo | `deductions` |
| Obra social | 3 % sobre remunerativo + no remunerativo | `deductions` |
| FAECYS | 0,5 % sobre todo | `deductions` |
| Sindicato / aporte solidario | 2 % sobre todo | `deductions` |

Estos porcentajes son **valores de referencia habituales** y hay que verificarlos contra el
convenio y el acuerdo vigente (por ejemplo, si estás afiliado o no al sindicato, o si el
acuerdo dice que una suma no remunerativa no lleva ciertos aportes). Se pisan desde
`payroll_profile.config_overrides`.

**Estimado vs. liquidado.** `compareEstimateWithPayslip` compara remunerativo, no remunerativo,
descuentos y neto, y marca diferencias mayores a 1 %. Sirve para detectar aumentos que no se
aplicaron o conceptos nuevos en el recibo.

## Alquiler (`rent-adjustment.ts`)

Contrato: `start_date`, `base_rent_cents`, `adjustment_interval_months`, `index_type`
(`ICL`, `IPC` o `FIXED`), `duration_months`, `lag_months`, `fixed_rate`.

- **Fechas de ajuste:** inicio + k × intervalo (recortando al fin de mes si hace falta), sin pasar la duración.
- **ICL:** coeficiente = ICL(fecha de ajuste) / ICL(fecha del ajuste anterior o inicio). Se usa el último valor publicado en o antes de cada fecha.
- **IPC:** se componen las variaciones mensuales de los *intervalo* meses que terminan en
  (mes de ajuste − 1 − `lag_months`). Con el lag por defecto (1), un ajuste en abril usa dic + ene + feb,
  porque el IPC de marzo todavía no se publicó. Revisá qué dice tu contrato y ajustá `lag_months`.
- **FIXED:** `(1 + fixed_rate)` en cada ajuste.
- **Datos faltantes:** se proyectan con la inflación mensual estimada y el ajuste se marca como *proyectado*.
- El nuevo valor rige desde el mes del ajuste (para el flujo de caja).

## Contado vs. cuotas (`installments-vpn.ts`)

```
VP(cuotas) = Σ cuota_k / (1 + r)^(k + desfase)      k = 0 … n−1
r = max(inflación mensual estimada, rendimiento alternativo mensual)
```

- Desfase por defecto: 1 mes (la primera cuota se paga con el próximo resumen).
- Precio contado = precio de lista × (1 − descuento contado).
- Si VP(cuotas) < precio contado, conviene cuotas. Menos de 0,5 % de diferencia se considera "da igual".
- También se calcula la **tasa implícita** (TIR mensual) que te cobran por financiar y su equivalente anual.

## Flujo de caja (`cashflow.ts`) y simulador (`simulator.ts`)

- Todo se convierte en movimientos mensuales: ingresos recurrentes (con crecimiento opcional),
  gastos fijos indexados por inflación, cuotas futuras, alquiler ajustado mes a mes, aportes a
  objetivos y puntuales (aguinaldo en junio y diciembre, vencimientos anuales).
- **Cuello de botella:** un mes con saldo de cierre menor al mínimo deseado o con egresos mayores
  a los ingresos. Se explica el motivo (entra el aumento del alquiler, se acumulan cuotas).
- **Simulador:** aplica operaciones (compra en cuotas, cambio de inflación, cambio de ingreso,
  aporte extra) sobre una copia y compara contra la proyección base. Nunca toca los datos reales.

## Vencimientos y alertas (`deadlines.ts`, `anomalies.ts`)

- **Semáforo:** vencido, vence hoy, próximos 3 días, esta semana (≤ 7 días), más adelante, pagado.
- **Anomalías de boletas:** el historial se lleva a pesos de hoy con la inflación de referencia.
  Se avisa si la boleta supera en más de 30 % el promedio de los últimos 6 meses **y** está a más de
  2 desvíos estándar, salvo que sea parecida al mismo mes del año anterior (estacionalidad: gas en
  invierno, luz en verano). Con menos de 3 boletas previas no se opina.

## Objetivos (`goals.ts`)

- Con fecha objetivo: aporte mensual = restante / meses que faltan (contando el actual).
- Con aporte mensual: meses = ⌈restante / aporte⌉.
- Aporte semanal = mensual × 12 / 52. Se muestra qué % del margen mensual representa.

## Historial de precios (`price-history.ts`)

Variación real = (1 + variación del precio) / (1 + inflación acumulada del período) − 1.
Positivo = el producto se encareció más que tu inflación de referencia.
