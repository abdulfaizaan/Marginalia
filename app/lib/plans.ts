// SP1: the app is free; one fair-use tier protects the server/db (the user pays their own AI bill).
export const CAPS = {
  notesMonth: 200,
  visualsMonth: 40,
  versionsDays: 30, // PRD ED-2: 30 days of version history
  exports: ["pdf", "word", "md"] as const,
};

// Legacy: the users.plan column still exists in the DB (old rows + data export); new code must not gate on it.
export type Plan = "free" | "plus" | "pro";
