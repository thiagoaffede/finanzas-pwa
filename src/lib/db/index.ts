import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Db } from "@/lib/data/db-type";
import * as schema from "./schema";

/**
 * Conexión a PostgreSQL. Se inicializa de forma perezosa para que el build
 * funcione sin DATABASE_URL (las páginas usan datos de ejemplo hasta conectar la base).
 * - Neon (*.neon.tech): driver HTTP serverless, ideal para Vercel.
 * - Cualquier otro Postgres (por ejemplo uno local para desarrollo): driver `pg` normal.
 */
let _db: Db | null = null;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL. Copiá .env.example a .env.local y completala.");
  _db = (isNeonUrl(url) ? drizzleNeon(neon(url), { schema }) : drizzlePg(new Pool({ connectionString: url, max: 5 }), { schema })) as unknown as Db;
  return _db;
}

export { schema };
