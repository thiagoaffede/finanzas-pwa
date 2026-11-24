import { json } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { deleteUnconfirmedDocument, getDocumentFile } from "@/lib/data/repository";

const UUID = /^[0-9a-f-]{36}$/i;

/** Devuelve el archivo original (PDF o foto) para verlo o descargarlo. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "No encontrado" }, { status: 404 });
  const { db, res } = requireDb();
  if (!db) return res;
  const file = await getDocumentFile(db, id);
  if (!file) return json({ error: "No encontrado" }, { status: 404 });
  const name = (file.fileName ?? `documento-${id.slice(0, 8)}`).replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "content-type": file.mimeType,
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Descarta un original que no se llegó a confirmar. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "No encontrado" }, { status: 404 });
  const { db, res } = requireDb();
  if (!db) return res;
  return json({ deleted: await deleteUnconfirmedDocument(db, id) });
}
