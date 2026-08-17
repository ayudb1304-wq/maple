/**
 * Typed access to the three env vars in docs/ARCHITECTURE.md.
 *
 * GEOAPIFY_KEY is server-only on purpose: it is read lazily inside route
 * handlers so it can never be inlined into a client bundle.
 */

export const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
).replace(/\/$/, '');

/** Descriptive User-Agent required by the rate-limit etiquette in docs/API_REFERENCE.md. */
export const USER_AGENT = `SkyTonight/1.0 (+${APP_URL})`;

/** Server-only. Returns null when unset so callers degrade to the gradient card. */
export function geoapifyKey(): string | null {
  return process.env.GEOAPIFY_KEY?.trim() || null;
}

/** Server-only. Returns null when unset so Pro buttons render "Coming soon". */
export function dodoCheckoutUrl(): string | null {
  return process.env.DODO_CHECKOUT_URL?.trim() || null;
}
