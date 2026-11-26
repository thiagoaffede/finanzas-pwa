import type { ISODate } from "@/types/finance";

export const COURSE_KINDS = ["ati", "materia"] as const;
export type CourseKind = (typeof COURSE_KINDS)[number];

export const COURSE_STATUSES = ["cursando", "aprobado", "pausado"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const BLOCK_STATUSES = ["pendiente", "en_curso", "aprobado"] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];

export const EVENT_KINDS = ["examen", "consulta", "autoevaluacion", "entrega", "tramite", "otro"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EXAM_RESULTS = ["aprobado", "desaprobado", "ausente"] as const;
export type ExamResult = (typeof EXAM_RESULTS)[number];

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  examen: "Examen",
  consulta: "Consulta",
  autoevaluacion: "Autoevaluación",
  entrega: "Entrega",
  tramite: "Trámite",
  otro: "Otro",
};

export const BLOCK_STATUS_LABEL: Record<BlockStatus, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  aprobado: "Aprobado",
};

export type EventSource = "manual" | "moodle" | "ics" | "plantilla";

export const LEVEL_LABEL = ["Sin empezar", "Leído", "Con el material", "A ciegas", "Lo explico"] as const;

export interface StudyBlock {
  id: string;
  courseId: string;
  position: number;
  name: string;
  groupName: string | null;
  detail: string | null;
  /** 0 sin empezar · 1 leído · 2 con el material · 3 a ciegas · 4 explicado en voz alta. */
  level: number;
  status: BlockStatus;
  targetDate: ISODate | null;
  completedOn: ISODate | null;
}

export interface StudyEvent {
  id: string;
  courseId: string | null;
  kind: EventKind;
  title: string;
  date: ISODate;
  endDate: ISODate | null;
  time: string | null;
  place: string | null;
  link: string | null;
  notes: string | null;
  result: ExamResult | null;
  source: EventSource;
  externalCourse: string | null;
}

export interface StudyCourse {
  id: string;
  name: string;
  kind: CourseKind;
  status: CourseStatus;
  moodleName: string | null;
  reviewDays: number;
  notes: string | null;
  blocks: StudyBlock[];
}

export interface StudySession {
  id: string;
  courseId: string | null;
  date: ISODate;
  minutes: number;
  source: "pomodoro" | "manual";
  note: string | null;
}

export interface StudyMistake {
  id: string;
  courseId: string | null;
  blockId: string | null;
  date: ISODate;
  description: string;
  fixed: boolean;
}
