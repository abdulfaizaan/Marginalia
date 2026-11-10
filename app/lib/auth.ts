import { db, hashPassword, checkPassword, uid, DAY } from "./db";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "mg_session";

export function verifyPassword(pw: string, stored: string) { return checkPassword(pw, stored); }
export function newHash(pw: string) { return hashPassword(pw); }

export async function createSession(userId: string) {
  const token = uid();
  db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(token, userId, Date.now(), Date.now() + 30 * DAY);
  return token;
}
const COOKIE_ATTRS = `Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;

export function setSessionCookie(res: Response, token: string) {
  // route handlers: attach via headers (Next 16-friendly). Secure only in prod — over plain HTTP the browser drops Secure cookies.
  const headers = new Headers(res.headers);
  headers.append("set-cookie", `${SESSION_COOKIE}=${token}; ${COOKIE_ATTRS}; Max-Age=${30 * 86400}`);
  return new Response(res.body, { status: res.status, headers });
}
export async function clearSessionCookie(res: Response) {
  const headers = new Headers(res.headers);
  headers.append("set-cookie", `${SESSION_COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`);
  return new Response(res.body, { status: res.status, headers });
}

const STORED = Symbol("kernel-stub-user");
export interface SessionUser { id: string; email: string; name: string; plan: string; role: string; promo: string | null; promo_months: number; settings: string; status: string; [STORED]?: never }

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db.prepare(
    "SELECT u.id,u.email,u.name,u.plan,u.role,u.promo,u.promo_months,u.settings,u.status,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?"
  ).get(token) as (SessionUser & { expires_at: number }) | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  const { expires_at, ...user } = row;
  db.prepare("UPDATE users SET last_active=? WHERE id=?").run(Date.now(), user.id);
  return user;
}
export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}
export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw new Error("FORBIDDEN");
  return u;
}

export function jsonError(status: number, message: string) {
  return Response.json({ error: message }, { status });
}
