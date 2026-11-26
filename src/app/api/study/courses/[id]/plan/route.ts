import { json } from "@/lib/api";
import { requireDb } from "@/lib/api-db";
import { listBlocks, listCourses, listEvents, setBlockTargets } from "@/lib/data/study";
import { nextExam, planTargets } from "@/lib/study/pace";
import { todayAR } from "@/lib/finance";

/** Reparte fechas objetivo parejas para los temas que faltan, hasta el comienzo del repaso. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { db, res } = requireDb();
  if (!db) return res;
  const id = (await params).id;
  const today = todayAR();
  const course = (await listCourses(db)).find((c) => c.id === id);
  if (!course) return json({ error: "Curso no encontrado" }, { status: 404 });
  const exam = nextExam(await listEvents(db, { from: today }), id, today);
  if (!exam) return json({ error: "Cargá primero la fecha del examen de este curso." }, { status: 422 });
  const targets = planTargets(await listBlocks(db, id), today, exam, course.reviewDays);
  await setBlockTargets(db, targets);
  return json({ ok: true, planned: targets.length, exam });
}
