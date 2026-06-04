import { NextRequest, NextResponse } from "next/server";
import { primarySql } from "@/server/neon";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await primarySql`
    DELETE FROM "analytics"
    WHERE "clickedAt" < NOW() - INTERVAL '90 days'
  `;

  return NextResponse.json({ deleted: result.count }, { status: 200 });
}
