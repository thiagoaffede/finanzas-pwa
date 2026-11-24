// Aplica las migraciones de ./drizzle a la base de DATABASE_URL.
// Se corre en cada deploy de Vercel (script "vercel-build") y a mano con `npm run db:migrate`.
import { existsSync } from "node:fs";

if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL no está definida: se saltean las migraciones.");
  process.exit(0);
}

let neonHost = false;
try {
  neonHost = new URL(url).hostname.endsWith(".neon.tech");
} catch {}

if (neonHost) {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  await migrate(drizzle(neon(url)), { migrationsFolder: "drizzle" });
} else {
  const { default: pg } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new pg.Pool({ connectionString: url });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.end();
}
console.log("Migraciones aplicadas.");
