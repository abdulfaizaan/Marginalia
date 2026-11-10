import { db, uid, DAY, hashPassword, checkPassword } from "@/lib/db";
import { createSession, setSessionCookie, clearSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const b = await req.json() as { action: "signup" | "signin" | "google" | "signout"; email?: string; password?: string; name?: string; ageOk?: boolean };
  if (b.action === "signout") {
    const jar = await import("next/headers").then((m) => m.cookies());
    const token = jar.get("mg_session")?.value;
    if (token) db.prepare("DELETE FROM sessions WHERE token=?").run(token);
    return clearSessionCookie(Response.json({ ok: true }));
  }
  if (b.action === "google") {
    // dummy key / dummy OAuth: logs into the demo Google account
    let u = db.prepare("SELECT * FROM users WHERE email=?").get("google-demo@marginalia.app") as { id: string } | undefined;
    if (!u) {
      const id = uid();
      db.prepare("INSERT INTO users(id,email,password,name,plan,role,promo,promo_months,status,age_ok,settings,joined_at,last_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id, "google-demo@marginalia.app", hashPassword("demo1234"), "Demo", "free", "user", null, 0, "active", 1, "{}", Date.now(), Date.now());
      u = { id };
    }
    const token = await createSession(u.id);
    return setSessionCookie(Response.json({ ok: true }), token);
  }
  const email = (b.email || "").trim().toLowerCase();
  const password = b.password || "";
  if (password.length > 128) return Response.json({ error: "Password is too long (128 characters maximum)." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "That email does not look right." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "Password needs at least 8 characters." }, { status: 400 });
  if (b.action === "signup") {
    if (!b.ageOk) return Response.json({ error: "Marginalia is 13+. Please confirm your age to continue." }, { status: 403 });
    if (db.prepare("SELECT id FROM users WHERE email=?").get(email)) return Response.json({ error: "That email already has an account. Sign in instead." }, { status: 409 });
    const id = uid();
    db.prepare("INSERT INTO users(id,email,password,name,plan,role,promo,promo_months,status,age_ok,settings,joined_at,last_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, email, hashPassword(password), b.name?.slice(0, 40) || email.split("@")[0], "free", "user", null, 0, "active", 1, "{}", Date.now(), Date.now());
    // starter content: one seeded notebook
    db.prepare("INSERT INTO notebooks VALUES(?,?,?,?,?)").run(uid(), id, "First notebook", 0, 0);
    const token = await createSession(id);
    return setSessionCookie(Response.json({ ok: true }), token);
  }
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(email) as { id: string; password: string; role: string } | undefined;
  if (!u || !checkPassword(password, u.password)) return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  db.prepare("UPDATE users SET last_active=? WHERE id=?").run(Date.now(), u.id);
  const token = await createSession(u.id);
  void DAY;
  return setSessionCookie(Response.json({ ok: true, role: u.role }), token);
}
