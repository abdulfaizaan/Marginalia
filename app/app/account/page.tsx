import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db, monthKey, parseSettings, plainRows } from "@/lib/db";
import { TIERS, type Plan } from "@/lib/plans";
import { usageGet } from "@/lib/admin";
import AccountClient from "@/components/AccountClient";

export default async function AccountPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Loading account…</div>}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  await connection(); // usage month + last-active are per-request; never prerender
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const plan = (user.plan || "free") as Plan;
  const tier = TIERS[plan] || TIERS.free;
  const used = plainRows([usageGet(user.id)])[0];
  const row = db.prepare("SELECT email,name,promo,status FROM users WHERE id=?").get(user.id) as
    | { email: string; name: string; promo: string | null; status: string }
    | undefined;
  void monthKey;
  void parseSettings;
  return (
    <AccountClient
      user={{ email: row?.email || user.email, name: user.name, plan, promo: row?.promo || null, promoMonths: user.promo_months || 0, status: row?.status || "active" }}
      used={used}
      caps={{ margin: tier.notesMonth, visuals: tier.visualsMonth }}
    />
  );
}
