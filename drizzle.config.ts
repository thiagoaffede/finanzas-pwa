import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";

// drizzle-kit no lee .env.local solo: lo cargamos si existe.
if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
