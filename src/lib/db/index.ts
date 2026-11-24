import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Conexión a Neon / PostgreSQL. Se inicializa de forma perezosa para que el build
 * funcione sin DATABASE_URL (las páginas usan datos de ejemplo hasta conectar la base).
 */
let _db: NeonHttpDatabase<typeof schema> | null = null;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL. Copiá .env.example a .env.local y completala.");
  _db = drizzle(neon(url), { schema });
  return _db;
}

export { schema };
