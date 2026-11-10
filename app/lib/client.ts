"use client";

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...init });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth")) {
    // expired session → sign-in once, centrally, instead of every caller failing silently
    window.location.href = "/sign-in";
    throw new Error("Session expired — redirecting to sign-in.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function words(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

export function docText(doc: { content?: { text?: string; content?: { text?: string }[] }[] }): string {
  return (doc.content || [])
    .map((b) => (b.content || []).map((r) => r.text ?? "").join(""))
    .join(" ")
    .trim();
}

/** Words written by the user only — AI-inserted paragraphs carry attrs.ai="1". */
export function docUserWords(doc: { content?: { attrs?: { ai?: unknown }; text?: string; content?: { text?: string }[] }[] }): number {
  const t = (doc.content || [])
    .filter((b) => !b.attrs?.ai)
    .map((b) => (b.content || []).map((r) => r.text ?? "").join(""))
    .join(" ")
    .trim();
  return words(t);
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h >= 2 ? h + " hours" : "an hour"} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "Last week";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function setTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try { localStorage.setItem("mg-theme", dark ? "dark" : "light"); } catch { /* private mode */ }
}
