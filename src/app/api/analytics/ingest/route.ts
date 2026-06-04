import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/server/db";

export const runtime = "nodejs";

const clickEventSchema = z.object({
  linkId: z.string(),
  workspaceId: z.string(),
  slug: z.string(),
  url: z.string(),
  domain: z.string(),
  ip: z.string(),
  country: z.string().default(""),
  city: z.string().default(""),
  continent: z.string().default(""),
  device: z.string().default(""),
  browser: z.string().default(""),
  os: z.string().default(""),
  ua: z.string().default(""),
  referer: z.string().default(""),
  trigger: z.string().default(""),
  userId: z.string().nullable().optional(),
  utmSource: z.string().default(""),
  utmMedium: z.string().default(""),
  utmCampaign: z.string().default(""),
  utmTerm: z.string().default(""),
  utmContent: z.string().default(""),
});

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const secret = process.env.ANALYTICS_INGEST_SECRET;

  if (!secret) {
    console.error("ANALYTICS_INGEST_SECRET is not configured");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = clickEventSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await db.clickEvent.create({ data: parsed.data });
  } catch (error) {
    console.error("Failed to write analytics event", error);
    return NextResponse.json(
      { error: "Failed to write analytics event" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
