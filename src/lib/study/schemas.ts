import { z } from "zod";
import { BLOCK_STATUSES, COURSE_KINDS, COURSE_STATUSES, EVENT_KINDS, EXAM_RESULTS } from "./types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora HH:MM");
const text = (max: number) => z.string().trim().max(max);
const url = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https?:\/\//i.test(v), "Link http(s)");

export const courseInput = z.object({
  name: text(80).min(1),
  kind: z.enum(COURSE_KINDS).default("ati"),
  blocks: z.number().int().min(0).max(40).default(0),
  examDate: isoDate.nullish(),
  moodleName: text(120).nullish(),
  reviewDays: z.number().int().min(0).max(30).default(3),
  notes: text(1000).nullish(),
});
export type CourseInput = z.infer<typeof courseInput>;

export const coursePatch = z.object({
  name: text(80).min(1).optional(),
  status: z.enum(COURSE_STATUSES).optional(),
  moodleName: text(120).nullable().optional(),
  reviewDays: z.number().int().min(0).max(30).optional(),
  notes: text(1000).nullable().optional(),
});
export type CoursePatch = z.infer<typeof coursePatch>;

export const blockInput = z.object({
  courseId: z.string().uuid(),
  name: text(120).min(1),
  targetDate: isoDate.nullish(),
});
export type BlockInput = z.infer<typeof blockInput>;

export const blockPatch = z.object({
  name: text(120).min(1).optional(),
  detail: text(300).nullable().optional(),
  status: z.enum(BLOCK_STATUSES).optional(),
  level: z.number().int().min(0).max(4).optional(),
  targetDate: isoDate.nullable().optional(),
  completedOn: isoDate.optional(),
});
export type BlockPatch = z.infer<typeof blockPatch>;

export const eventInput = z
  .object({
    courseId: z.string().uuid().nullish(),
    kind: z.enum(EVENT_KINDS),
    title: text(160).min(1),
    date: isoDate,
    endDate: isoDate.nullish(),
    time: time.nullish(),
    place: text(160).nullish(),
    link: url.nullish(),
    notes: text(1000).nullish(),
  })
  .refine((e) => !e.endDate || e.endDate >= e.date, { message: "La fecha de fin es anterior al inicio", path: ["endDate"] });
export type EventInput = z.infer<typeof eventInput>;

export const eventPatch = z.object({
  courseId: z.string().uuid().nullable().optional(),
  kind: z.enum(EVENT_KINDS).optional(),
  title: text(160).min(1).optional(),
  date: isoDate.optional(),
  endDate: isoDate.nullable().optional(),
  time: time.nullable().optional(),
  place: text(160).nullable().optional(),
  link: url.nullable().optional(),
  notes: text(1000).nullable().optional(),
  result: z.enum(EXAM_RESULTS).nullable().optional(),
});
export type EventPatch = z.infer<typeof eventPatch>;

export const sessionInput = z.object({
  courseId: z.string().uuid().nullish(),
  date: isoDate,
  minutes: z.number().int().min(1).max(600),
  source: z.enum(["pomodoro", "manual"]).default("pomodoro"),
  note: text(200).nullish(),
});
export type SessionInput = z.infer<typeof sessionInput>;

export const mistakeInput = z.object({
  courseId: z.string().uuid().nullish(),
  blockId: z.string().uuid().nullish(),
  date: isoDate,
  description: text(500).min(1),
});
export type MistakeInput = z.infer<typeof mistakeInput>;

export const mistakePatch = z.object({
  description: text(500).min(1).optional(),
  fixed: z.boolean().optional(),
});
export type MistakePatch = z.infer<typeof mistakePatch>;
