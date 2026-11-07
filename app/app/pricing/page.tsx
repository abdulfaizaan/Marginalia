import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth";
import PricingClient from "@/components/PricingClient";
import type { Plan } from "@/lib/plans";
import { metrics } from "@/lib/admin";

export default async function PricingPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Loading plans…</div>}>
      <Pricing />
    </Suspense>
  );
}

async function Pricing() {
  const user = await getSessionUser();
  void metrics;
  return <PricingClient signedIn={!!user} currentPlan={(user?.plan || null) as Plan | null} />;
}
