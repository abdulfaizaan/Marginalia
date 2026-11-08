import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db, parseSettings, monthKey, plainRows, userAiConfig } from "@/lib/db";
import LibraryClient, { type LibNote } from "@/components/LibraryClient";
import RouteFx from "@/components/RouteFx";
import { LibrarySkeleton } from "@/components/Skeletons";

export default async function LibraryPage() {
  return (
    <Suspense fallback={<RouteFx enter={null}><LibrarySkeleton /></RouteFx>}>
      <Library />
    </Suspense>
  );
}

async function Library() {
  await connection(); // usage month + last-active are per-request; never prerender
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const notebooks = plainRows(db.prepare("SELECT * FROM notebooks WHERE user_id=? ORDER BY position").all(user.id) as { id: string; name: string; is_journal: number }[]);
  const rows = db.prepare(
    `SELECT n.id,n.title,n.updated_at,n.words,n.private,n.mode,n.notebook_id,nb.name AS notebook, substr(n.text,1,160) AS snippet
     FROM notes n JOIN notebooks nb ON nb.id=n.notebook_id WHERE n.user_id=? ORDER BY n.updated_at DESC`
  ).all(user.id) as unknown as LibNote[];
  const counts = db.prepare(
    "SELECT note_id, SUM(type='error') e, SUM(type='question') q, SUM(type='direction') d FROM margins WHERE user_id=? GROUP BY note_id"
  ).all(user.id) as { note_id: string; e: number; q: number; d: number }[];
  const byNote = Object.fromEntries(counts.map((c) => [c.note_id, c]));
  const pins = db.prepare("SELECT DISTINCT note_id FROM margins WHERE user_id=? AND status='pinned'").all(user.id) as { note_id: string }[];
  const pinnedSet = new Set(pins.map((p) => p.note_id));
  const notes: LibNote[] = rows.map((n) => ({
    ...n,
    error: byNote[n.id]?.e || 0, question: byNote[n.id]?.q || 0, direction: byNote[n.id]?.d || 0,
    pinned: pinnedSet.has(n.id),
  }));
  const u = db.prepare("SELECT margin,visuals FROM usage WHERE month=? AND user_id=?").get(monthKey(), user.id) as { margin: number; visuals: number } | undefined;
  void parseSettings;
  return (
    <RouteFx>
      <LibraryClient
        user={{ name: user.name, email: user.email }}
        hasAi={!!userAiConfig(user.id)?.key}
        notebooks={notebooks}
        notes={notes}
        used={{ margin: u?.margin ?? 0, visuals: u?.visuals ?? 0 }}
      />
    </RouteFx>
  );
}
