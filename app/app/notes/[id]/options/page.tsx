import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db, parseSettings } from "@/lib/db";
import { TIERS, type Plan } from "@/lib/plans";
import OptionsClient from "@/components/OptionsClient";

export default async function OptionsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Loading options…</div>}>
      <Options id={params} />
    </Suspense>
  );
}

async function Options({ id: paramsId }: { id: Promise<{ id: string }> }) {
  const { id } = await paramsId;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=/notes/${id}/options`);
  const plan = (user.plan || "free") as Plan;
  const tier = TIERS[plan] || TIERS.free;
  const note = db.prepare("SELECT id,settings FROM notes WHERE id=? AND user_id=?").get(id, user.id) as
    | { id: string; settings: string }
    | undefined;
  if (!note) redirect("/notes");
  const cutoff = tier.versionsDays ? Date.now() - tier.versionsDays * 86_400_000 : 0;
  const versions = db
    .prepare("SELECT id,words,created_at FROM versions WHERE note_id=? AND created_at>? ORDER BY created_at DESC LIMIT 30")
    .all(id, cutoff) as { id: string; words: number; created_at: number }[];
  return (
    <OptionsClient
      noteId={id}
      plan={plan}
      pro={plan === "pro"}
      settings={parseSettings(note.settings)}
      versions={versions}
      retentionDays={tier.versionsDays}
    />
  );
}
