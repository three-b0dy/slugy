import { NextRequest } from "next/server";

import { jsonWithETag } from "@/lib/http";

export async function GET(req: NextRequest) {
  return jsonWithETag(req, { domains: [] });
}

export async function POST(req: NextRequest) {
  return jsonWithETag(
    req,
    { error: "Custom domains are not available in this build" },
    { status: 410 },
  );
}

export async function DELETE(req: NextRequest) {
  return jsonWithETag(
    req,
    { error: "Custom domains are not available in this build" },
    { status: 410 },
  );
}

export async function PATCH(req: NextRequest) {
  return jsonWithETag(
    req,
    { error: "Custom domains are not available in this build" },
    { status: 410 },
  );
}
