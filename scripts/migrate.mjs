// Aplica las migraciones de ./drizzle a la base de DATABASE_URL (Neon).
// Se corre en cada deploy de Vercel (script "vercel-build") y a mano con `npm run db:migrate`.
import { existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL no está definida: se saltean las migraciones.");
  process.exit(0);
}
const db = drizzle(neon(process.env.DATABASE_URL));
await migrate(db, { migrationsFolder: "drizzle" });
console.log("Migraciones aplicadas.");
