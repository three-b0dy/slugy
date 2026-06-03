import { type NextRequest, NextResponse } from "next/server";
import { getLink } from "@/lib/middleware/get-link";

export async function handleCustomDomainRequest(
  req: NextRequest,
  hostname: string,
): Promise<NextResponse | null> {
  const slug = req.nextUrl.pathname.slice(1);

  // Only handle single-segment paths (short link slugs)
  if (!slug || slug.includes("/")) return null;

  try {
    const result = await getLink(
      slug,
      req.headers.get("cookie"),
      req.nextUrl.origin,
      hostname,
    );

    if (result.success && result.url) {
      return NextResponse.redirect(new URL(result.url));
    }
  } catch (err) {
    console.error("[custom-domain] getLink error:", err);
  }

  return null; // Fall through → Next.js renders 404
}
