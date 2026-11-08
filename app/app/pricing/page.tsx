import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth";
import PricingClient from "@/components/PricingClient";
import RouteFx from "@/components/RouteFx";
import { PricingSkeleton } from "@/components/Skeletons";
import type { Plan } from "@/lib/plans";
import { metrics } from "@/lib/admin";

export default async function PricingPage() {
  return (
    <Suspense fallback={<RouteFx enter={null}><PricingSkeleton /></RouteFx>}>
      <Pricing />
    </Suspense>
  );
}

async function Pricing() {
  const user = await getSessionUser();
  void metrics;
  return (
    <RouteFx>
      <PricingClient signedIn={!!user} currentPlan={(user?.plan || null) as Plan | null} />
    </RouteFx>
  );
}
