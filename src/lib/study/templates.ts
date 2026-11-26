import type { ISODate } from "@/types/finance";
import type { EventKind } from "./types";

/**
 * Cursos armados para cargar con un botón. Estructura tomada del Cuadernillo de Matemática 2026
 * (Depto. de Matemática, UNS) y de la Guía de trabajo autogestionado de ACP (DCIC-UNS).
 * Las fechas objetivo siguen el plan semana a semana del 8/10 al 16/12; se pueden cambiar o
 * volver a repartir desde la app.
 */
export interface CourseTemplate {
  name: string;
  moodleName?: string;
  reviewDays: number;
  notes?: string;
  blocks: { name: string; group?: string; detail?: string; target?: ISODate }[];
  events: { uid: string; kind: EventKind; title: string; date: ISODate; endDate?: ISODate; notes?: string }[];
}

export interface StudyTemplate {
  id: string;
  title: string;
  description: string;
  courses: CourseTemplate[];
  /** Fechas generales (sin curso). */
  events: CourseTemplate["events"];
}

const EXAM_NOTE = "Exámenes ATI el jueves 17/12 y el viernes 18/12. Confirmá el día, el horario y el aula en el sitio de la UNS.";

const MATEMATICA: CourseTemplate = {
  name: "Matemática",
  reviewDays: 3,
  notes: "Cuadernillo Matemática 2026 (147 pág.). Cada tema pasa por 4 niveles: leer, resolver con el material, resolver a ciegas y explicar en voz alta.",
  blocks: [
    { group: "Bloque 1 · Aritmética", name: "1.1 Conjuntos numéricos", detail: "p. 1 · Ubicar un número en ℕ, ℤ, ℚ o ℝ", target: "2026-10-11" },
    { group: "Bloque 1 · Aritmética", name: "1.2 Recta numérica y valor absoluto", detail: "p. 4 · |x| = a y desigualdades con valor absoluto", target: "2026-10-11" },
    { group: "Bloque 1 · Aritmética", name: "1.3 Operaciones con reales", detail: "p. 7 · Signos, distributiva, orden de operaciones", target: "2026-10-18" },
    { group: "Bloque 1 · Aritmética", name: "1.4 Potenciación y radicación", detail: "p. 13 · Reglas de exponentes, potencia ↔ raíz", target: "2026-10-18" },
    { group: "Bloque 1 · Aritmética", name: "1.5 Radicales y racionalización", detail: "p. 17 · Operar radicales, racionalizar denominadores", target: "2026-10-25" },
    { group: "Bloque 1 · Aritmética", name: "1.6 Logaritmos y notación científica", detail: "p. 21 · Propiedades, cambio de base, redondeo", target: "2026-10-25" },
    { group: "Bloque 2 · Álgebra", name: "2.1 Expresiones algebraicas", detail: "p. 29 · Operar y factorizar (común, agrupamiento)", target: "2026-11-01" },
    { group: "Bloque 2 · Álgebra", name: "2.2 Ecuaciones", detail: "p. 33 · Lineales, cuadráticas y de grado superior", target: "2026-11-01" },
    { group: "Bloque 2 · Álgebra", name: "2.3 Inecuaciones", detail: "p. 41 · Lineales y cuadráticas; cuidado con los negativos", target: "2026-11-08" },
    { group: "Bloque 2 · Álgebra", name: "2.4 Polinomios", detail: "p. 46 · Grado, división, factorización, raíces", target: "2026-11-08" },
    { group: "Bloque 2 · Álgebra", name: "2.5 Expresiones racionales", detail: "p. 55 · Simplificar, operar, dominio", target: "2026-11-15" },
    { group: "Bloque 3 · Funciones", name: "3.1 Funciones: conceptos", detail: "p. 63 · Dominio, recorrido, composición, gráfico", target: "2026-11-15" },
    { group: "Bloque 3 · Funciones", name: "3.2 Función lineal y rectas", detail: "p. 75 · Pendiente, paralelas y perpendiculares", target: "2026-11-22" },
    { group: "Bloque 3 · Funciones", name: "3.3 Función cuadrática y parábolas", detail: "p. 89 · Vértice, raíces, máximo/mínimo", target: "2026-11-29" },
    { group: "Bloque 4 · Trigonometría", name: "4.1 Sistema sexagesimal y radial", detail: "p. 99 · Grados ↔ radianes, ángulos notables", target: "2026-12-13" },
    { group: "Bloque 4 · Trigonometría", name: "4.2 Razones trigonométricas", detail: "p. 102 · Seno, coseno, tangente; triángulos rectángulos", target: "2026-12-13" },
    { group: "Actividades (p. 109-147)", name: "Actividades 1 · Aritmética", detail: "p. 109", target: "2026-12-06" },
    { group: "Actividades (p. 109-147)", name: "Actividades 2 · Álgebra", detail: "p. 115", target: "2026-12-06" },
    { group: "Actividades (p. 109-147)", name: "Actividades 3 · Funciones", detail: "p. 120", target: "2026-12-13" },
    { group: "Actividades (p. 109-147)", name: "Actividades 4 · Trigonometría", detail: "p. 128", target: "2026-12-13" },
  ],
  events: [{ uid: "ati2026-examen-mat", kind: "examen", title: "Examen ATI Matemática", date: "2026-12-17", notes: EXAM_NOTE }],
};

const acp = (n: number, name: string, target: ISODate, group: string) => ({ name: `Bloque ${n} · ${name}`, group, detail: `Test de Seguimiento ${n} (TS${n})`, target });
const F = "Fundamentos (bloques 1 a 5)";
const P = "Práctica guiada (bloques 6 a 15)";

const ACP: CourseTemplate = {
  name: "Análisis y Comprensión de Problemas",
  reviewDays: 3,
  notes: "Guía de trabajo autogestionado ACP. Un bloque está aprobado cuando aprobaste su Test de Seguimiento en el Aula Virtual. Los bloques impares de la práctica (propuestos) son los que rinden.",
  blocks: [
    acp(1, "Organización del curso", "2026-10-11", F),
    acp(2, "Introducción a ACP", "2026-10-11", F),
    acp(3, "Analizar y comprender el problema", "2026-10-25", F),
    acp(4, "Construcción de la solución (5 estrategias)", "2026-11-08", F),
    acp(5, "Verificación de la solución", "2026-11-15", F),
    acp(6, "Problemas resueltos I", "2026-11-15", P),
    acp(7, "Problemas propuestos I", "2026-11-22", P),
    acp(8, "Problemas resueltos II", "2026-11-22", P),
    acp(9, "Problemas propuestos II", "2026-11-29", P),
    acp(10, "Problemas resueltos III", "2026-11-29", P),
    acp(11, "Problemas propuestos III", "2026-12-06", P),
    acp(12, "Problemas resueltos IV", "2026-12-06", P),
    acp(13, "Problemas propuestos IV", "2026-12-13", P),
    acp(14, "Problemas resueltos V", "2026-12-13", P),
    acp(15, "Problemas propuestos V", "2026-12-13", P),
  ],
  events: [{ uid: "ati2026-examen-acp", kind: "examen", title: "Examen ATI Análisis y Comprensión de Problemas", date: "2026-12-17", notes: EXAM_NOTE }],
};

export const STUDY_TEMPLATES: StudyTemplate[] = [
  {
    id: "ati-uns-2026",
    title: "ATI UNS · diciembre 2026",
    description: "Matemática (20 temas) y Análisis y Comprensión de Problemas (15 bloques), con las fechas de tu plan y del calendario ATI.",
    courses: [MATEMATICA, ACP],
    events: [
      { uid: "ati2026-preinscripcion", kind: "tramite", title: "Preinscripción Ingresantes 2027", date: "2026-11-02", endDate: "2026-12-10", notes: "Primer cuatrimestre 2027." },
      { uid: "ati2026-tutorias", kind: "consulta", title: "Tutorías virtuales ATI", date: "2026-11-30", endDate: "2026-12-11", notes: "Usalas para lo que no te cierra, no para avanzar." },
      { uid: "ati2026-cierre", kind: "tramite", title: "Cierre de matriculación y tutorías · abre el formulario de evaluación", date: "2026-12-11" },
      { uid: "ati2026-simulacro", kind: "otro", title: "Simulacro de examen", date: "2026-12-14", notes: "Un problema de ACP completo (analizar, construir, verificar) y un set de Matemática cronometrado." },
      { uid: "ati2026-limite", kind: "tramite", title: "Límite de inscripción a la evaluación ATI", date: "2026-12-15", notes: "Se deshabilita el formulario de inscripción a la instancia de diciembre." },
    ],
  },
];
