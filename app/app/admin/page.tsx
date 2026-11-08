import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth";
import AdminOverview from "@/components/AdminOverview";
import RouteFx from "@/components/RouteFx";
import { AdminSkeleton } from "@/components/Skeletons";

export default async function AdminPage() {
  return (
    <Suspense fallback={<RouteFx enter={null}><AdminSkeleton /></RouteFx>}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  await connection(); // admin sign-in expiry is per-request; never prerender
  const user = await getSessionUser();
  if (!user || user.role !== "admin") redirect("/admin/sign-in");
  return <RouteFx><AdminOverview /></RouteFx>;
}
