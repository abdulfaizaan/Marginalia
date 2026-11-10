import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db, plainRows } from "@/lib/db";
import { CAPS } from "@/lib/plans";
import { usageGet } from "@/lib/admin";
import AccountClient from "@/components/AccountClient";
import RouteFx from "@/components/RouteFx";
import { AccountSkeleton } from "@/components/Skeletons";

export default async function AccountPage() {
  return (
    <Suspense fallback={<RouteFx enter={null}><AccountSkeleton /></RouteFx>}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  await connection(); // usage month + last-active are per-request; never prerender
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const used = plainRows([usageGet(user.id)])[0];
  const row = db.prepare("SELECT email,name,promo,status FROM users WHERE id=?").get(user.id) as
    | { email: string; name: string; promo: string | null; status: string }
    | undefined;
  return (
    <RouteFx>
      <AccountClient
        user={{ email: row?.email || user.email, name: user.name, status: row?.status || "active" }}
        used={used}
        caps={{ margin: CAPS.notesMonth, visuals: CAPS.visualsMonth }}
      />
    </RouteFx>
  );
}
