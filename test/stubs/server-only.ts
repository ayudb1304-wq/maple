/**
 * No-op stand-in for the `server-only` package under vitest.
 *
 * The real package exports a module that throws when resolved through the
 * "browser" condition, which is exactly what Vite resolves. The guard still
 * applies in the Next.js build; tests just need the import to succeed.
 */
export {};
