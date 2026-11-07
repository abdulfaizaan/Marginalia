import { db, uid } from "@/lib/db";
import { getSessionUser, jsonError } from "@/lib/auth";
import { TIERS, enforcePromo, LAUNCH_PRICE_CENTS, type Plan } from "@/lib/plans";

// POST /api/billing {plan:'plus'|'pro', promo?, card:{number,expiry,cvc,email}}
// Billing is DUMMY (BILLING_MODE=dummy): any 15-19 digit card number goes through.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first — the pricing page opens checkout after you do.");
  const b = await req.json() as { plan: "plus" | "pro"; promo?: string; card?: { number?: string; email?: string }; preview?: boolean };
  const tier = TIERS[b.plan];
  if (!tier) return jsonError(400, "Pick Plus or Pro (Free is the default).");
  if (b.preview) {
    // validate-only: no redemption, no charge — order-summary preview
    const asked = (b.promo || "").trim().toUpperCase();
    if (!asked) return Response.json({ preview: true, charged: tier.priceCents });
    const row = db.prepare("SELECT * FROM promo_codes WHERE UPPER(code)=?").get(asked) as { code: string; used: number; total: number } | undefined;
    if (!row || row.used >= row.total) return jsonError(409, row && row.used >= row.total ? "This code has reached its 100-user limit." : "That promo code is not recognized.");
    const r = enforcePromo(row.code, row.used, row.total, !!db.prepare("SELECT 1 FROM promo_redemptions WHERE user_id=?").get(user.id), b.plan, user.promo_months || 0);
    if (!r.ok) return jsonError(409, r.reason || "Promo not applicable.");
    return Response.json({ preview: true, charged: LAUNCH_PRICE_CENTS, renews: "Promo price for 3 months, then the standard price — we email before that." });
  }
  const digits = (b.card?.number || "").replace(/\D/g, "");
  if (digits.length < 15 || digits.length > 19) return jsonError(400, "Card number off — needs 15-19 digits. Try 4242 4242 4242 4242 (dummy).");

  let promoCode: string | null = null;
  let discountMonths = 0;
  const asked = (b.promo || "").trim().toUpperCase();
  if (asked) {
    const row = db.prepare("SELECT * FROM promo_codes WHERE UPPER(code)=? AND total-used>0").get(asked) as { code: string; used: number; total: number } | undefined;
    const already = !!db.prepare("SELECT 1 FROM promo_redemptions WHERE user_id=?").get(user.id);
    if (!row && asked === "LAUNCH50")
      return Response.json({ error: "This code has reached its 100-user limit." }, { status: 409 });
    if (!row) return Response.json({ error: "That promo code is not recognized." }, { status: 400 });
    const r = enforcePromo(row.code, row.used, row.total, already, b.plan, user.promo_months || 0);
    if (!r.ok) return Response.json({ error: r.reason }, { status: 409 });
    promoCode = row.code;
    discountMonths = r.discountMonths || 0;
    db.prepare("UPDATE promo_codes SET used=used+1 WHERE code=?").run(row.code);
    db.prepare("INSERT INTO promo_redemptions VALUES(?,?,?,?)").run(uid(), user.id, row.code, Date.now());
  }

  db.prepare("UPDATE users SET plan=?, promo=?, promo_months=? WHERE id=?").run(b.plan, promoCode, discountMonths, user.id);
  const priceCents = discountMonths ? LAUNCH_PRICE_CENTS : tier.priceCents;
  return Response.json({
    ok: true, plan: b.plan, charged: priceCents / 100,
    renews: discountMonths ? "Promo price for 3 months, then the standard plan price — we email before that." : `monthly`,
  });
}
