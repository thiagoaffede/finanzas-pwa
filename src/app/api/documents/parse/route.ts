import { json } from "@/lib/api";
import { parseBillExtraction } from "@/lib/parsers/bill-parser";
import { parsePayslipExtraction } from "@/lib/parsers/payslip-parser";
import { extractDocument, ExtractionError, SUPPORTED_MIME_TYPES, type DocumentKind } from "@/lib/extraction/claude-extractor";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

/**
 * Lectura de boletas y recibos.
 * - multipart/form-data con `file` + `kind`: lee el archivo con Claude y devuelve un borrador normalizado.
 * - application/json con `{ kind, extraction }`: solo normaliza una extracción ya hecha.
 * No guarda nada: el borrador se confirma en pantalla y se guarda con /api/bills o /api/payroll/payslips.
 */
export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { kind?: string; extraction?: unknown } | null;
    if (!body?.kind || !body.extraction) return json({ error: "Falta kind o extraction" }, { status: 400 });
    return normalize(body.kind === "payslip" ? "payslip" : "bill", body.extraction);
  }

  if (!type.includes("multipart/form-data")) return json({ error: "Content-Type no soportado" }, { status: 415 });

  const form = await req.formData();
  const file = form.get("file");
  const kind: DocumentKind = form.get("kind") === "payslip" ? "payslip" : "bill";
  if (!(file instanceof File)) return json({ error: "Falta el archivo" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return json({ error: "El archivo supera 20 MB" }, { status: 413 });
  if (!SUPPORTED_MIME_TYPES.includes(file.type)) return json({ error: "Subí un PDF o una foto (JPG, PNG o WEBP)." }, { status: 415 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "La lectura automática no está configurada (falta ANTHROPIC_API_KEY). Cargalo a mano." }, { status: 501 });
  }

  try {
    const extraction = await extractDocument({ kind, data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type });
    return normalize(kind, extraction);
  } catch (e) {
    if (e instanceof ExtractionError) return json({ error: e.message }, { status: e.status });
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Demasiadas lecturas seguidas. Probá en un minuto." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return json({ error: "El servicio de lectura no respondió. Probá de nuevo." }, { status: 502 });
    throw e;
  }
}

function normalize(kind: DocumentKind, extraction: unknown) {
  const result = kind === "payslip" ? parsePayslipExtraction(extraction) : parseBillExtraction(extraction);
  if (!result.ok) return json({ kind, ok: false, errors: result.errors, raw: extraction }, { status: 422 });
  return json({ kind, ok: true, draft: result.value, warnings: result.warnings, raw: extraction });
}
