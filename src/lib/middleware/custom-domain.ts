import { NextRequest, NextResponse } from "next/server";

// Custom domain support removed for personal self-hosted use.
// All links use the default domain only.
export async function handleCustomDomainRequest(
  _req: NextRequest,
  _hostname: string,
): Promise<NextResponse | null> {
  return null;
}
