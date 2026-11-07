export type Plan = "free" | "plus" | "pro";
export interface TierCfg {
  notesMonth: number; visualsMonth: number; versionsDays: number; // 0 = unlimited
  exports: ("pdf" | "word" | "md")[]; hideAi: boolean; strictness: boolean; // strictness control (Direct) Pro only
  priceCents: number; label: string; tagline: string;
}
export const TIERS: Record<Plan, TierCfg> = {
  free: { notesMonth: 30, visualsMonth: 3, versionsDays: 7, exports: ["pdf"], hideAi: false, strictness: false, priceCents: 0, label: "Free", tagline: "Try the core loop" },
  plus: { notesMonth: 300, visualsMonth: 30, versionsDays: 30, exports: ["pdf", "word", "md"], hideAi: true, strictness: false, priceCents: 999, label: "Plus", tagline: "Regular notes and study" },
  pro: { notesMonth: 3000, visualsMonth: 100, versionsDays: 0, exports: ["pdf", "word", "md"], hideAi: true, strictness: true, priceCents: 1999, label: "Pro", tagline: "High-volume writing" },
};
export const LAUNCH_PRICE_CENTS = 499; // 50% of Plus, 3 months

/** Promo-cap decision as a pure function so the check script can pin it. */
export function enforcePromo(code: string, used: number, total: number, alreadyRedeemed: boolean, planWanted: Plan, promoMonthsSoFar: number): { ok: boolean; reason?: string; discountMonths?: number } {
  if (planWanted !== "plus") return { ok: false, reason: "LAUNCH50 applies to the Plus plan" };
  if (alreadyRedeemed) return { ok: false, reason: "One redemption per account" };
  if (used >= total) return { ok: false, reason: "This code has reached its 100-user limit" };
  if (promoMonthsSoFar > 0) return { ok: false, reason: "Promo already active" };
  return { ok: true, discountMonths: 3 };
}
