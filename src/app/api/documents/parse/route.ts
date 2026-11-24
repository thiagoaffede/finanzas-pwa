import { json } from "@/lib/api";
import { parseBillExtraction } from "@/lib/parsers/bill-parser";
import { parsePayslipExtraction } from "@/lib/parsers/payslip-parser";

/**
 * Fase 3: extracción de boletas y recibos.
 *
 * - multipart/form-data con `file` + `kind` → enviar al LLM con el schema de docs/extraction-schemas.md
 *   (pendiente: requiere ANTHROPIC_API_KEY y almacenamiento de archivos).
 * - application/json con `{ kind, extraction }` → normaliza y valida una extracción ya hecha
 *   (sirve para probar los parsers y para la pantalla de confirmación).
 */
export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { kind?: string; extraction?: unknown } | null;
    if (!body?.kind || !body.extraction) return json({ error: "Falta kind o extraction" }, { status: 400 });
    const result = body.kind === "payslip" ? parsePayslipExtraction(body.extraction) : parseBillExtraction(body.extraction);
    return json(result, { status: result.ok ? 200 : 422 });
  }

  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Falta el archivo" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return json({ error: "El archivo supera 10 MB" }, { status: 413 });
    return json(
      {
        ok: false,
        message: `Recibimos "${file.name}". La lectura automática de boletas y recibos llega en la próxima etapa; por ahora cargalo a mano.`,
      },
      { status: 501 },
    );
  }

  return json({ error: "Content-Type no soportado" }, { status: 415 });
}
