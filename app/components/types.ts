// Shared client-side row shapes (subsets of the DB rows).
export interface MarginRowLite {
  id: string; note_id: string; anchor: string; num: number; type: string;
  body: string; status: string; rating: number | null; reply: string | null; want_visual: number;
}
export interface AskMsgLite {
  id: string; role: string; body: string; kind: string; level: number; created_at: number;
}
export interface VisualLite { id: string; spec: string; created_at: number; }
export interface NotebookLite { id: string; name: string; is_journal: number; }
