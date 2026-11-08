import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth";
import AdminSection from "@/components/AdminSection";
import RouteFx from "@/components/RouteFx";
import { AdminSkeleton } from "@/components/Skeletons";

const SECTIONS = ["users", "promo-codes", "ai-quality", "audit-log"];

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  return (
    <Suspense fallback={<RouteFx enter={null}><AdminSkeleton /></RouteFx>}>
      <Gate section={params} />
    </Suspense>
  );
}

async function Gate({ section: paramsSection }: { section: Promise<{ section: string }> }) {
  await connection(); // per-request admin session; never prerender
  const { section } = await paramsSection;
  if (!SECTIONS.includes(section)) notFound();
  const user = await getSessionUser();
  if (!user || user.role !== "admin") redirect("/admin/sign-in");
  return <RouteFx><AdminSection section={section} /></RouteFx>;
}
