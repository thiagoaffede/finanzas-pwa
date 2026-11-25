import { getTableColumns, inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import * as s from "@/lib/db/schema";
import type { Db } from "@/lib/data/db-type";

export const BACKUP_APP = "finanzas-pwa";
export const BACKUP_VERSION = 1;

/**
 * Tablas del backup, en orden de dependencias (las referenciadas primero).
 * Se restauran en este orden y se borran al revés. Las suscripciones push no
 * entran: son de cada dispositivo y se mantienen.
 */
export const BACKUP_TABLES = {
  accounts: s.accounts,
  categories: s.categories,
  documents: s.documents,
  bills: s.bills,
  transactions: s.transactions,
  transfers: s.transfers,
  installments: s.installments,
  payrollScales: s.payrollScales,
  payrollProfile: s.payrollProfile,
  payslips: s.payslips,
  rentContracts: s.rentContracts,
  indexValues: s.indexValues,
  goals: s.goals,
  goalContributions: s.goalContributions,
  marketQuotes: s.marketQuotes,
  settings: s.settings,
} as const satisfies Record<string, PgTable>;

export type BackupTable = keyof typeof BACKUP_TABLES;
export const BACKUP_TABLE_NAMES = Object.keys(BACKUP_TABLES) as BackupTable[];

type Row = Record<string, unknown>;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  /** Si incluye los archivos originales (PDF/fotos) de boletas y recibos. */
  withFiles: boolean;
  tables: Record<BackupTable, Row[]>;
}

/** Copia completa de la base. Sin `withFiles`, los documentos van sin el archivo (pesa mucho menos). */
export async function createBackup(db: Db, opts: { withFiles?: boolean; now?: Date } = {}): Promise<Backup> {
  const tables = {} as Record<BackupTable, Row[]>;
  for (const name of BACKUP_TABLE_NAMES) {
    const rows = (await db.select().from(BACKUP_TABLES[name] as PgTable)) as Row[];
    tables[name] = name === "documents" && !opts.withFiles ? rows.map((r) => ({ ...r, contentBase64: null })) : rows;
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: (opts.now ?? new Date()).toISOString(), withFiles: Boolean(opts.withFiles), tables };
}

const backupShape = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.string(),
  withFiles: z.boolean().optional(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export type BackupCheck = { ok: true; backup: Backup; counts: Record<BackupTable, number> } | { ok: false; error: string };

/** Revisa que el archivo sea un backup de esta app antes de tocar nada. */
export function parseBackup(raw: unknown): BackupCheck {
  const parsed = backupShape.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "El archivo no es un backup de esta app (o está dañado)." };
  const unknownTables = Object.keys(parsed.data.tables).filter((t) => !(t in BACKUP_TABLES));
  if (unknownTables.length) return { ok: false, error: `El backup trae tablas que esta versión no conoce: ${unknownTables.join(", ")}.` };
  const tables = {} as Record<BackupTable, Row[]>;
  const counts = {} as Record<BackupTable, number>;
  for (const name of BACKUP_TABLE_NAMES) {
    tables[name] = (parsed.data.tables[name] ?? []) as Row[];
    counts[name] = tables[name].length;
  }
  return { ok: true, backup: { ...parsed.data, app: BACKUP_APP, withFiles: Boolean(parsed.data.withFiles), tables }, counts };
}

/** Deja cada fila con las columnas que conoce la tabla y convierte las fechas-hora de texto a Date. */
function toInsertRows(table: PgTable, rows: Row[]): Row[] {
  const cols = getTableColumns(table);
  return rows.map((r) => {
    const out: Row = {};
    for (const [key, col] of Object.entries(cols)) {
      if (!(key in r)) continue;
      const v = r[key];
      out[key] = col.columnType === "PgTimestamp" && typeof v === "string" ? new Date(v) : v;
    }
    return out;
  });
}

async function wipe(db: Db) {
  for (const name of [...BACKUP_TABLE_NAMES].reverse()) await db.delete(BACKUP_TABLES[name] as PgTable);
}

async function insertAll(db: Db, tables: Record<BackupTable, Row[]>) {
  for (const name of BACKUP_TABLE_NAMES) {
    const table = BACKUP_TABLES[name] as PgTable;
    const rows = toInsertRows(table, tables[name]);
    for (let i = 0; i < rows.length; i += 500) await db.insert(table).values(rows.slice(i, i + 500));
  }
}

/**
 * Reemplaza todos los datos por los del backup. Si algo falla a mitad de camino,
 * vuelve a poner lo que había (el driver HTTP de Neon no tiene transacciones largas).
 * Los documentos sin archivo en el backup conservan el archivo que ya estaba guardado.
 */
export async function restoreBackup(db: Db, backup: Backup): Promise<{ restored: Record<BackupTable, number> }> {
  const previous = await createBackup(db, { withFiles: true });

  const docIds = backup.tables.documents.filter((d) => !d.contentBase64 && typeof d.id === "string").map((d) => d.id as string);
  const kept = new Map<string, string | null>();
  if (docIds.length) {
    const rows = await db.select({ id: s.documents.id, content: s.documents.contentBase64 }).from(s.documents).where(inArray(s.documents.id, docIds));
    for (const r of rows) kept.set(r.id, r.content);
  }
  const tables = { ...backup.tables, documents: backup.tables.documents.map((d) => (d.contentBase64 ? d : { ...d, contentBase64: kept.get(d.id as string) ?? null })) };

  try {
    await wipe(db);
    await insertAll(db, tables);
  } catch (err) {
    try {
      await wipe(db);
      await insertAll(db, previous.tables);
    } catch {
      throw new Error("No se pudo restaurar y tampoco volver al estado anterior. Restaurá de nuevo un backup que tengas.");
    }
    throw new Error(`No se pudo restaurar el backup; tus datos quedaron como estaban. (${err instanceof Error ? err.message.slice(0, 200) : "error"})`);
  }
  const restored = {} as Record<BackupTable, number>;
  for (const name of BACKUP_TABLE_NAMES) restored[name] = tables[name].length;
  return { restored };
}
