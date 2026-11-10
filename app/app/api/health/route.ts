// Health probe for the container/load balancer — no auth, no DB dependency beyond a touch.
import { db } from "@/lib/db";

export function GET() {
  try {
    db.prepare("SELECT 1").get();
    return Response.json({ ok: true, uptime: Math.round(process.uptime()) });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
