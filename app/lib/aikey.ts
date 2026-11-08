// Validating at the trust boundary: the only gate between the browser and the encrypted vault.
export interface AiKeyInput { vendor: string; key: string; model?: string; base?: string }
export type AiKeyValid =
  | { ok: true; vendor: "openai" | "xai" | "gemini" | "custom"; model: string | null; base: string | null }
  | { ok: false; error: string };

export function validateAiKey(inp: AiKeyInput, hasStoredKey = false): AiKeyValid {
  const vendor = inp.vendor?.toLowerCase();
  if (vendor !== "openai" && vendor !== "xai" && vendor !== "gemini" && vendor !== "custom")
    return { ok: false, error: "Pick a supported vendor (OpenAI, Grok, Gemini, or a custom OpenAI-compatible base)." };
  const key = String(inp.key || "").trim();
  const keepStored = !key && hasStoredKey; // metadata-only update: vendor/model/base change, stored encrypted key reused
  const min = vendor === "custom" ? 1 : 8; // Ollama "keys" are often the literal word "ollama" — allow short for custom
  if (!keepStored && key.length < min) return { ok: false, error: vendor === "custom" ? "Enter your key/token for the custom endpoint." : `That key looks too short to be real.` };
  if (vendor === "custom") {
    const base = String(inp.base || "").trim();
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      return { ok: false, error: "Custom vendors need a base URL starting with http:// or https:// (e.g. http://127.0.0.1:11434/v1)." };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return { ok: false, error: "Custom vendors need a base URL starting with http:// or https:// (e.g. http://127.0.0.1:11434/v1)." };
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    // SSRF guard: the user's key is sent as a bearer token to this base — cloud-metadata and
    // link-local ranges stay blocked; loopback/private/public remain allowed (Ollama/LAN by design).
    if (/^(169\.254\.|f[cd]|fe[89ab])/.test(host) || /metadata/i.test(host))
      return { ok: false, error: "That base URL is blocked (cloud metadata / link-local range). Use localhost, a LAN IP, or a public endpoint." };
    const model = String(inp.model || "").trim();
    if (!model) return { ok: false, error: "Custom vendors need a model name (e.g. llama3.1)." };
    return { ok: true, vendor: "custom", model, base: base.replace(/\/+$/, "") };
  }
  return { ok: true, vendor, model: String(inp.model || "").trim() || null, base: null };
}
