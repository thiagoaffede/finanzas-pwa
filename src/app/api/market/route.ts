import { getDollarQuotes } from "@/lib/market/dollar-client";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getDollarQuotes();
  return json(data, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" } });
}
