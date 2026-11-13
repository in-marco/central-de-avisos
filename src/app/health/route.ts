import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/lib/db-health";
import { buildHealthPayload } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUp = await checkDatabaseHealth();
  const payload = buildHealthPayload(databaseUp);

  return NextResponse.json(payload, {
    status: databaseUp ? 200 : 503,
  });
}
