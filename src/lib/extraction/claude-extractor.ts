import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/**
 * Lectura de boletas y recibos con Claude (Fase 3).
 *
 * Se manda el PDF o la foto y se pide JSON con un schema estricto (structured outputs).
 * Los montos vuelven como string tal cual están impresos; los normalizan los parsers.
 * Nada se guarda acá: el resultado va a la pantalla de confirmación.
 */

export const DEFAULT_EXTRACTION_MODEL = "claude-opus-5-5";

const SUPPORTED_IMAGES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof SUPPORTED_IMAGES)[number];
export const SUPPORTED_MIME_TYPES = ["application/pdf", ...SUPPORTED_IMAGES];

// Schemas para el modelo: todos los campos presentes, null cuando no aparecen.
const llmBill = z.object({
  emisor: z.string(),
  numero_cliente: z.string().nullable(),
  periodo: z.string().nullable(),
  fecha_emision: z.string().nullable(),
  vencimiento: z.string().nullable(),
  segundo_vencimiento: z.string().nullable(),
  monto: z.string(),
  moneda: z.string(),
  confianza: z.number(),
});

const llmPayslip = z.object({
  empleador: z.string().nullable(),
  periodo: z.string().nullable(),
  fecha_pago: z.string().nullable(),
  categoria: z.string().nullable(),
  haberes: z.array(z.object({ concepto: z.string(), monto: z.string(), remunerativo: z.boolean() })),
  descuentos: z.array(z.object({ concepto: z.string(), monto: z.string() })),
  total_remunerativo: z.string().nullable(),
  total_no_remunerativo: z.string().nullable(),
  total_descuentos: z.string().nullable(),
  neto: z.string(),
  confianza: z.number(),
});

export type DocumentKind = "bill" | "payslip";

const SYSTEM = `Leés documentos argentinos (boletas de servicios y recibos de sueldo) y devolvés sus datos en JSON.
Reglas:
- Copiá los montos exactamente como están impresos (por ejemplo "45.320,50"), sin hacer cuentas.
- Copiá fechas y períodos como aparecen (por ejemplo "18/11/2026" o "Octubre 2026").
- Si un dato no aparece en el documento, usá null. No inventes ni deduzcas valores.
- "confianza" va de 0 a 1 según qué tan legible y completo es el documento.`;

const PROMPTS: Record<DocumentKind, string> = {
  bill: `Es una boleta o factura de un servicio (luz, gas, agua, teléfono/internet, etc.).
"emisor": empresa que emite la factura. "monto": total a pagar al primer vencimiento. "vencimiento": primer vencimiento. "periodo": período facturado.`,
  payslip: `Es un recibo de sueldo argentino.
En "haberes" poné cada concepto que suma (básico, antigüedad, presentismo, adicionales, sumas no remunerativas), marcando "remunerativo" según la columna en que figura. En "descuentos" cada retención (jubilación, ley 19.032, obra social, sindicato, ganancias, etc.). "neto": neto a cobrar.`,
};

export class ExtractionError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
  }
}

export interface ExtractInput {
  kind: DocumentKind;
  data: Uint8Array;
  mimeType: string;
}

export async function extractDocument(
  input: ExtractInput,
  opts: { client?: Anthropic; model?: string } = {},
): Promise<Record<string, unknown>> {
  if (!SUPPORTED_MIME_TYPES.includes(input.mimeType)) {
    throw new ExtractionError(`Formato no soportado (${input.mimeType || "desconocido"}). Subí un PDF, JPG, PNG o WEBP.`, 415);
  }
  const client = opts.client ?? new Anthropic();
  const base64 = Buffer.from(input.data).toString("base64");
  const fileBlock =
    input.mimeType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } as const)
      : ({ type: "image", source: { type: "base64", media_type: input.mimeType as ImageType, data: base64 } } as const);

  const schema = input.kind === "bill" ? llmBill : llmPayslip;
  const response = await client.beta.messages.parse({
    model: opts.model ?? process.env.EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content: [fileBlock, { type: "text", text: PROMPTS[input.kind] }] }],
  });

  if (response.stop_reason === "refusal") throw new ExtractionError("No se pudo leer este documento. Cargalo a mano.");
  if (response.stop_reason === "max_tokens") throw new ExtractionError("El documento es demasiado largo para leerlo de una vez.");
  if (!response.parsed_output) throw new ExtractionError("La lectura no devolvió datos válidos. Probá con una foto más nítida.");
  return response.parsed_output as Record<string, unknown>;
}
