import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import VisualView from "@/components/VisualView";

export default async function VisualPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Opening visualizer…</div>}>
      <Visual id={params} />
    </Suspense>
  );
}

async function Visual({ id: paramsId }: { id: Promise<{ id: string }> }) {
  const { id } = await paramsId;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=/notes/${id}/visual`);
  const note = db.prepare("SELECT id,title FROM notes WHERE id=? AND user_id=?").get(id, user.id) as
    | { id: string; title: string }
    | undefined;
  if (!note) redirect("/notes");
  const visuals = db.prepare("SELECT id,spec,created_at FROM visuals WHERE note_id=? ORDER BY created_at DESC").all(id);
  const ask = db.prepare("SELECT * FROM ask_messages WHERE note_id=? ORDER BY created_at").all(id);
  return <VisualView noteId={note.id} noteTitle={note.title} visuals0={visuals as never} ask0={ask as never} />;
}
