import { sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "not_configured" | "error" = "not_configured";
  if (hasDatabase()) {
    try {
      await getDb().execute(sql`select 1`);
      database = "ok";
    } catch {
      database = "error";
    }
  }
  return json({ status: "ok", database, time: new Date().toISOString() });
}
