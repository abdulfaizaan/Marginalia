import { db, uid, userAiConfig } from "@/lib/db";
import { getSessionUser, jsonError } from "@/lib/auth";
import { validateAiKey, type AiKeyInput } from "@/lib/aikey";
import { encryptSecret } from "@/lib/crypto";

function audit(admin: string, action: string, detail: string) {
  db.prepare("INSERT INTO audit(id,admin,action,detail,created_at) VALUES(?,?,?,?,?)").run(uid(), admin, action, detail, Date.now());
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  const cfg = userAiConfig(user.id);
  // set == decryptable key actually present; vendor/model/base returned for the card UI. The key itself NEVER leaves.
  return Response.json({ set: !!(cfg?.vendor && cfg?.key), vendor: cfg?.vendor ?? null, model: cfg?.model ?? null, base: cfg?.base ?? null });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  let b: AiKeyInput;
  try {
    b = await req.json() as AiKeyInput;
  } catch {
    return jsonError(400, "Malformed request.");
  }
  const v = validateAiKey({ vendor: String(b.vendor || ""), key: String(b.key || ""), model: b.model ? String(b.model) : undefined, base: b.base ? String(b.base) : undefined });
  if (!v.ok) return jsonError(400, v.error);
  db.prepare("UPDATE users SET ai_vendor=?, ai_model=?, ai_base=?, ai_key_enc=? WHERE id=?")
    .run(v.vendor, v.model, v.base, encryptSecret(String(b.key).trim()), user.id);
  audit(user.email, "ai_key_set", v.vendor); // never the key material
  return Response.json({ ok: true });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return jsonError(401, "Sign in first.");
  db.prepare("UPDATE users SET ai_vendor=NULL, ai_model=NULL, ai_base=NULL, ai_key_enc=NULL WHERE id=?").run(user.id);
  audit(user.email, "ai_key_removed", "key cleared, offline engine resumes");
  return Response.json({ ok: true });
}
