import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db, parseSettings, plainRows } from "@/lib/db";
import Editor, { type EditorSettings } from "@/components/Editor";
import RouteFx from "@/components/RouteFx";
import { NoteSkeleton } from "@/components/Skeletons";
import type { Doc } from "@/lib/exporters";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<RouteFx enter={null}><NoteSkeleton /></RouteFx>}>
      <Note id={params} />
    </Suspense>
  );
}

async function Note({ id: paramsId }: { id: Promise<{ id: string }> }) {
  await connection(); // last-active touch is per-request; never prerender
  const { id } = await paramsId;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=/notes/${id}`);
  const note = db.prepare("SELECT * FROM notes WHERE id=? AND user_id=?").get(id, user.id) as
    | { id: string; title: string; mode: "think" | "ask"; content_json: string; private: number; settings: string; notebook_id: string }
    | undefined;
  if (!note) redirect("/notes");
  const margins = plainRows(
    db.prepare("SELECT * FROM margins WHERE note_id=? AND review_state IS NULL AND status NOT IN ('dismissed','thread') ORDER BY num").all(id)
  );
  const ask = plainRows(db.prepare("SELECT * FROM ask_messages WHERE note_id=? ORDER BY created_at").all(id));
  const visuals = plainRows(db.prepare("SELECT * FROM visuals WHERE note_id=? ORDER BY created_at DESC").all(id) as { id: string; spec: string; created_at: number }[]);
  const notebooks = plainRows(db.prepare("SELECT id,name,is_journal FROM notebooks WHERE user_id=? ORDER BY position").all(user.id) as { id: string; name: string; is_journal: number }[]);
  const nb = db.prepare("SELECT name FROM notebooks WHERE id=?").get(note.notebook_id) as { name: string } | undefined;
  const s = parseSettings(note.settings);
  return (
    <RouteFx>
      <Editor
        note={{
          id: note.id,
          title: note.title,
          mode: note.mode,
          private: !!note.private,
          notebook: nb?.name || "Notebook",
          doc: JSON.parse(note.content_json) as Doc,
          settings: {
            pace: s.pace as EditorSettings["pace"],
            strictness: s.strictness,
            margins: s.margins as EditorSettings["margins"],
            focus: !!s.focus,
            font: s.font,
            size: s.size,
          },
        }}
        margins0={margins as never}
        ask0={ask as never}
        visuals={visuals}
        notebooks={notebooks as never}
      />
    </RouteFx>
  );
}
