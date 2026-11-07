import { db, uid, checkPassword } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/auth";

const CODE = () => process.env.ADMIN_CODE || "123456";

export async function POST(req: Request) {
  const { email, password, code } = await req.json() as { email: string; password: string; code: string };
  const u = db.prepare("SELECT * FROM users WHERE email=? AND role='admin'").get((email || "").trim().toLowerCase()) as { id: string; password: string } | undefined;
  if (!u || !checkPassword(password || "", u.password) || (code || "").trim() !== CODE())
    return Response.json({ error: "Any of the three is wrong. Admin sign-in needs email, password and a valid verification code." }, { status: 403 });
  db.prepare("INSERT INTO audit VALUES(?,?,?,?,?)").run(uid(), email, "Admin signed in", "", Date.now());
  const token = await createSession(u.id);
  return setSessionCookie(Response.json({ ok: true }), token);
}
