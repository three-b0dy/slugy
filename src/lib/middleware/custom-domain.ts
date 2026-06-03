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

    if (result.url) {
      const resolvedUrl = new URL(result.url, req.nextUrl.origin);

      if (resolvedUrl.origin === req.nextUrl.origin) {
        const status = resolvedUrl.searchParams.get("status");

        if (resolvedUrl.pathname === "/" && status === "not-found") {
          return NextResponse.rewrite(
            new URL("/not-found", req.nextUrl.origin),
          );
        }

        if (resolvedUrl.pathname === "/" && status === "error") {
          return NextResponse.rewrite(
            new URL("/not-found", req.nextUrl.origin),
          );
        }

        if (resolvedUrl.pathname === "/" && status === "expired") {
          return NextResponse.rewrite(
            new URL("/?status=expired", req.nextUrl.origin),
          );
        }
      }

      if (result.success) {
        return NextResponse.redirect(resolvedUrl);
      }
    }

    if (result.requiresPassword) {
      return NextResponse.rewrite(req.nextUrl);
    }
  } catch (err) {
    console.error("[custom-domain] getLink error:", err);
  }

  return null; // Fall through → Next.js renders 404
}
