import { USER_AGENT } from './env';

/**
 * Shared server-side fetch wrapper implementing the rate-limit etiquette in
 * docs/API_REFERENCE.md: descriptive User-Agent, 5s timeout, one retry with
 * jitter, and a per-provider TTL handed to the Next.js data cache.
 *
 * Never throws. Callers get `null` on any failure so a single dead provider
 * degrades one section of the verdict instead of 500-ing the whole page.
 */

const DEFAULT_TIMEOUT_MS = 5_000;

export type CachedFetchOptions = {
  /** TTL in seconds for the Next.js data cache. Per-provider, see docs/API_REFERENCE.md. */
  revalidate: number;
  timeoutMs?: number;
  accept?: string;
  /** Label used in warn logs. Never include URLs with keys here. */
  label: string;
};

/** Sleep with a small random jitter so retries from many instances don't align. */
function jitteredDelay(baseMs: number): Promise<void> {
  const ms = baseMs + Math.random() * baseMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attempt(url: string, opts: CachedFetchOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: opts.accept ?? 'application/json',
      },
      signal: controller.signal,
      // Caching is opt-in since Next 15, so force-cache is required alongside
      // the TTL. Without it every card render would hit the provider fresh.
      cache: 'force-cache',
      next: { revalidate: opts.revalidate },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch with retry. Returns the Response, or null if both attempts fail. */
export async function cachedFetch(
  url: string,
  opts: CachedFetchOptions,
): Promise<Response | null> {
  for (let i = 0; i < 2; i++) {
    try {
      const res = await attempt(url, opts);
      if (res.ok) return res;
      // 4xx will not fix itself on retry; 5xx and 429 might.
      if (res.status < 500 && res.status !== 429) {
        warn(opts.label, `HTTP ${res.status}`);
        return null;
      }
      warn(opts.label, `HTTP ${res.status}${i === 0 ? ', retrying' : ''}`);
    } catch (err) {
      const reason = err instanceof Error ? err.name : 'unknown error';
      warn(opts.label, `${reason}${i === 0 ? ', retrying' : ''}`);
    }
    if (i === 0) await jitteredDelay(150);
  }
  return null;
}

/** Fetch and JSON-parse. Returns null on transport failure or malformed JSON. */
export async function cachedFetchJson(
  url: string,
  opts: CachedFetchOptions,
): Promise<unknown | null> {
  const res = await cachedFetch(url, opts);
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    warn(opts.label, 'response was not valid JSON');
    return null;
  }
}

function warn(label: string, message: string): void {
  // Deliberately logs the provider label, never the URL, so a keyed URL can
  // never reach the logs (hard rule 5 in CLAUDE.md).
  console.warn(`[provider:${label}] ${message}`);
}
