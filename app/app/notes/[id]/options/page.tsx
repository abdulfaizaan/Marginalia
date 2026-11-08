import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db, parseSettings, plainRows } from "@/lib/db";
import { CAPS, type Plan } from "@/lib/plans";
import OptionsClient from "@/components/OptionsClient";
import RouteFx from "@/components/RouteFx";
import { OptionsSkeleton } from "@/components/Skeletons";

export default async function OptionsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<RouteFx enter={null}><OptionsSkeleton /></RouteFx>}>
      <Options id={params} />
    </Suspense>
  );
}

async function Options({ id: paramsId }: { id: Promise<{ id: string }> }) {
  await connection(); // versions cutoff uses Date.now(); never prerender
  const { id } = await paramsId;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=/notes/${id}/options`);
  const plan = (user.plan || "free") as Plan;
  const note = db.prepare("SELECT id,settings FROM notes WHERE id=? AND user_id=?").get(id, user.id) as
    | { id: string; settings: string }
    | undefined;
  if (!note) redirect("/notes");
  const cutoff = CAPS.versionsDays ? Date.now() - CAPS.versionsDays * 86_400_000 : 0;
  const versions = plainRows(
    db.prepare("SELECT id,words,created_at FROM versions WHERE note_id=? AND created_at>? ORDER BY created_at DESC LIMIT 30").all(id, cutoff) as { id: string; words: number; created_at: number }[]
  );
  return (
    <RouteFx>
      <OptionsClient
        noteId={id}
        plan={plan}
        pro={plan === "pro"}
        settings={parseSettings(note.settings)}
        versions={versions}
        retentionDays={CAPS.versionsDays}
      />
    </RouteFx>
  );
}
