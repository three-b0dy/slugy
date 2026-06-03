import { timingSafeEqual, createHash } from "crypto";
import { db } from "@/server/db";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { hashKey } from "@/lib/redis";

export type ApiKeyAuthResult =
  | { success: true; userId: string }
  | { success: false; reason: "missing" | "invalid" }
  | {
      success: false;
      reason: "rate_limited";
      limit: number;
      reset: number;
      remaining: number;
    };

function timingSafeStringEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export async function resolveApiKeyAuth(
  req: Request,
  workspaceSlug: string,
): Promise<ApiKeyAuthResult> {
  const envKey = process.env.SLUGY_API_KEY;
  if (!envKey) {
    return { success: false, reason: "missing" };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { success: false, reason: "missing" };
  }

  const providedKey = authHeader.slice(7); // len("Bearer ") === 7
  if (!providedKey) {
    return { success: false, reason: "missing" };
  }

  // Rate-limit on hashed key to prevent brute-force enumeration
  const rateResult = await checkRateLimit(hashKey(providedKey));
  if (!rateResult.success) {
    return {
      success: false,
      reason: "rate_limited",
      limit: rateResult.limit,
      reset: rateResult.reset,
      remaining: rateResult.remaining,
    };
  }

  if (!timingSafeStringEqual(providedKey, envKey)) {
    return { success: false, reason: "invalid" };
  }

  const workspace = await db.workspace.findFirst({
    where: { slug: workspaceSlug, deletedAt: null },
    select: { userId: true },
  });

  if (!workspace) {
    return { success: false, reason: "invalid" };
  }

  return { success: true, userId: workspace.userId };
}
