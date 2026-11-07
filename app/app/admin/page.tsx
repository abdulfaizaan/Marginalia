import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth";
import AdminOverview from "@/components/AdminOverview";

export default async function AdminPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh p-10 text-sm text-white/60" style={{ background: "#0e1524" }}>Loading console…</div>}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  await connection(); // admin sign-in expiry is per-request; never prerender
  const user = await getSessionUser();
  if (!user || user.role !== "admin") redirect("/admin/sign-in");
  return <AdminOverview />;
}
