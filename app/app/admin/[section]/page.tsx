import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AdminSection from "@/components/AdminSection";

const SECTIONS = ["users", "promo-codes", "ai-quality", "audit-log"];

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-dvh p-10 text-sm text-white/60" style={{ background: "#0e1524" }}>Loading…</div>}>
      <Gate section={params} />
    </Suspense>
  );
}

async function Gate({ section: paramsSection }: { section: Promise<{ section: string }> }) {
  const { section } = await paramsSection;
  if (!SECTIONS.includes(section)) notFound();
  const user = await getSessionUser();
  if (!user || user.role !== "admin") redirect("/admin/sign-in");
  return <AdminSection section={section} />;
}
