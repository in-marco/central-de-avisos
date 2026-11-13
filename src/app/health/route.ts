import { NextResponse } from "next/server";
import { buildHealthPayload } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(buildHealthPayload());
}
