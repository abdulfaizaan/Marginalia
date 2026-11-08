import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db, plainRows } from "@/lib/db";
import VisualView from "@/components/VisualView";
import RouteFx from "@/components/RouteFx";
import { VisualSkeleton } from "@/components/Skeletons";

export default async function VisualPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<RouteFx enter={null}><VisualSkeleton /></RouteFx>}>
      <Visual id={params} />
    </Suspense>
  );
}

async function Visual({ id: paramsId }: { id: Promise<{ id: string }> }) {
  await connection(); // per-request session data; never prerender
  const { id } = await paramsId;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=/notes/${id}/visual`);
  const note = db.prepare("SELECT id,title FROM notes WHERE id=? AND user_id=?").get(id, user.id) as
    | { id: string; title: string }
    | undefined;
  if (!note) redirect("/notes");
  const visuals = plainRows(db.prepare("SELECT id,spec,created_at FROM visuals WHERE note_id=? ORDER BY created_at DESC").all(id) as { id: string; spec: string; created_at: number }[]);
  const ask = plainRows(db.prepare("SELECT * FROM ask_messages WHERE note_id=? ORDER BY created_at").all(id));
  return (
    <RouteFx>
      <VisualView noteId={note.id} noteTitle={note.title} visuals0={visuals as never} ask0={ask as never} />
    </RouteFx>
  );
}
