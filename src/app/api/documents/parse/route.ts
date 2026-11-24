import Anthropic from "@anthropic-ai/sdk";
import { json } from "@/lib/api";
import { getDb, hasDatabase } from "@/lib/db";
import { parseBillExtraction } from "@/lib/parsers/bill-parser";
import { parsePayslipExtraction } from "@/lib/parsers/payslip-parser";
import { billFromText, payslipFromText, pdfText } from "@/lib/parsers/text-extraction";
import { extractDocument, ExtractionError, SUPPORTED_MIME_TYPES, type DocumentKind } from "@/lib/extraction/claude-extractor";
import { createDocument, updateDocument } from "@/lib/data/repository";

export const maxDuration = 60;

/** Vercel corta los pedidos de más de 4,5 MB; las fotos se achican en el celu antes de subir. */
const MAX_BYTES = 4 * 1024 * 1024;

type Method = "ia" | "texto" | "manual";

/**
 * Lectura de boletas y recibos.
 * - multipart/form-data con `file` + `kind`: guarda el original (si hay base) y trata de leerlo:
 *   con Claude si hay ANTHROPIC_API_KEY; si no, con el texto del PDF (gratis). Si no se puede leer,
 *   devuelve un borrador vacío para completar a mano, con el original ya guardado.
 * - application/json con `{ kind, extraction }`: solo normaliza una extracción ya hecha.
 * Nada queda como boleta o recibo hasta confirmarlo en pantalla.
 */
export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { kind?: string; extraction?: unknown } | null;
    if (!body?.kind || !body.extraction) return json({ error: "Falta kind o extraction" }, { status: 400 });
    const kind = body.kind === "payslip" ? "payslip" : "bill";
    const r = normalize(kind, body.extraction);
    return r.ok ? json({ kind, ...r }) : json({ kind, ...r }, { status: 422 });
  }

  if (!type.includes("multipart/form-data")) return json({ error: "Content-Type no soportado" }, { status: 415 });

  const form = await req.formData();
  const file = form.get("file");
  const kind: DocumentKind = form.get("kind") === "payslip" ? "payslip" : "bill";
  if (!(file instanceof File)) return json({ error: "Falta el archivo" }, { status: 400 });
  if (file.size > MAX_BYTES) return json({ error: "El archivo supera 4 MB. Probá con una foto más chica o el PDF original." }, { status: 413 });
  if (!SUPPORTED_MIME_TYPES.includes(file.type)) return json({ error: "Subí un PDF o una foto (JPG, PNG o WEBP)." }, { status: 415 });

  const data = new Uint8Array(await file.arrayBuffer());
  const db = hasDatabase() ? getDb() : null;
  const documentId = db ? await createDocument(db, { kind, mimeType: file.type, fileName: file.name || null, data }) : null;

  const { method, extraction, notes, error } = await read(kind, data, file.type);
  const result = extraction ? normalize(kind, extraction) : null;

  if (db && documentId) {
    await updateDocument(db, documentId, {
      method,
      status: result?.ok ? "parsed" : "failed",
      extractedJson: extraction ?? null,
      error: result && !result.ok ? result.errors.join("; ") : (error ?? null),
    });
  }

  const warnings = [...notes, ...(result?.ok ? result.warnings : (result?.errors ?? []))];
  return json({
    kind,
    method,
    documentId,
    ok: Boolean(result?.ok),
    draft: result?.ok ? result.draft : {},
    warnings,
    raw: extraction ?? null,
    message: error,
  });
}

async function read(kind: DocumentKind, data: Uint8Array, mimeType: string): Promise<{ method: Method; extraction?: unknown; notes: string[]; error?: string }> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return { method: "ia", extraction: await extractDocument({ kind, data, mimeType }), notes: [] };
    } catch (e) {
      const error =
        e instanceof ExtractionError
          ? e.message
          : e instanceof Anthropic.RateLimitError
            ? "Demasiadas lecturas seguidas. Probá en un minuto."
            : e instanceof Anthropic.APIError
              ? "El servicio de lectura no respondió."
              : null;
      if (error === null) throw e;
      // Si falla la IA y es PDF, probamos con el texto.
      if (mimeType !== "application/pdf") return { method: "manual", notes: [], error: `${error} Completalo a mano.` };
    }
  }

  if (mimeType !== "application/pdf") {
    return { method: "manual", notes: [], error: "Las fotos se completan a mano (la lectura automática gratis funciona con PDFs). La foto queda guardada." };
  }
  const text = await pdfText(data).catch(() => "");
  if (text.replace(/\s/g, "").length < 30) {
    return { method: "manual", notes: [], error: "El PDF no tiene texto (parece escaneado). Completalo a mano; el archivo queda guardado." };
  }
  const { extraction, found } = kind === "payslip" ? payslipFromText(text) : billFromText(text);
  return {
    method: "texto",
    extraction,
    notes: [found.length ? `Leído del texto del PDF (${found.join(", ")}). Revisá que esté bien.` : "No se reconocieron datos en el PDF. Completalo a mano."],
  };
}

function normalize(kind: DocumentKind, extraction: unknown) {
  const result = kind === "payslip" ? parsePayslipExtraction(extraction) : parseBillExtraction(extraction);
  if (!result.ok) return { ok: false as const, errors: result.errors, raw: extraction };
  return { ok: true as const, draft: result.value, warnings: result.warnings, raw: extraction };
}
