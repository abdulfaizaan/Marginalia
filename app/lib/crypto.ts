import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

// Next.js runs with cwd = app/, so .env lives at process.cwd()/.env.
const ENV_PATH = () => join(process.cwd(), ".env");

export function getAppSecret(): string {
  const env = process.env.APP_SECRET;
  if (env) return env;
  // Boot convenience: generate once into .env, never overwrite an existing entry.
  try {
    const path = ENV_PATH();
    if (existsSync(path)) {
      const line = readFileSync(path, "utf8").split("\n").find((l) => l.startsWith("APP_SECRET="));
      if (line) return line.slice("APP_SECRET=".length);
    }
    const secret = randomBytes(48).toString("base64url");
    appendFileSync(path, `APP_SECRET=${secret}\n`);
    process.env.APP_SECRET = secret;
    return secret;
  } catch {
    return "dev-only-secret-change-me"; // read-only fs etc. — still derivable key unless APP_SECRET set elsewhere
  }
}

function keyOf(): Buffer {
  // 32-byte AES key derived from the server secret; secret never appears in output.
  return createHash("sha256").update(getAppSecret()).digest();
}

export function encryptSecret(plain: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyOf(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, ct, tag]);
}

export function decryptSecret(blob: unknown): string | null {
  try {
    if (!(blob instanceof Uint8Array) && !Buffer.isBuffer(blob)) return null;
    const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob as Uint8Array);
    if (buf.length <= 28) return null;
    const d = createDecipheriv("aes-256-gcm", keyOf(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(buf.length - 16));
    const plain = Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]).toString("utf8");
    return plain || null;
  } catch {
    return null; // wrong/rotated secret, garbage input → fail closed (offline engine)
  }
}
