// Sliding-window rate limiter (pure, injectable clock — testable without a server).
// ponytail: in-memory buckets reset per process and don't shard across replicas —
// correct for the single-node deploy this app targets; upgrade = a shared store.

export interface Limiter { max: number; windowMs: number; now?: () => number }

export function createLimiter(opts: Limiter): (key: string) => boolean {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = opts.now ? opts.now() : Date.now();
    const list = (hits.get(key) || []).filter((h) => t - h < opts.windowMs);
    if (list.length >= opts.max) {
      hits.set(key, list);
      return false;
    }
    list.push(t);
    hits.set(key, list);
    return true;
  };
}
