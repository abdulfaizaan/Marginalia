import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createLimiter } from "@/lib/ratelimit";

// Rate limiting: auth endpoints are brute-force surfaces, AI routes have a monthly cap only.
// ponytail: per-process in-memory buckets (see ratelimit.ts ceiling note) — single-node deploy.
const authLimiter = createLimiter({ max: 10, windowMs: 60_000 });
const aiLimiter = createLimiter({ max: 15, windowMs: 60_000 });
export function proxy(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const isAi = request.nextUrl.pathname.startsWith("/api/ai");
  const allowed = isAi ? aiLimiter(ip) : authLimiter(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests — wait a minute and try again." },
      { status: 429 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth", "/api/admin-auth", "/api/ai/:path*"],
};
