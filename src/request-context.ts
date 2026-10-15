import { AsyncLocalStorage } from 'node:async_hooks';

// Only the transport supplies this resolver, after verifying the MCP subject.
// There is deliberately no shared-token or environment fallback.
const accounts = new AsyncLocalStorage<() => Promise<string>>();

export function withSpotifyAccount<T>(
  resolveToken: () => Promise<string>,
  fn: () => T,
): T {
  return accounts.run(resolveToken, fn);
}

export async function getSpotifyAccessToken(): Promise<string> {
  const resolve = accounts.getStore();
  if (!resolve)
    throw new Error('Sign in with Spotify before using Spotify tools.');
  return resolve();
}

// Stdio events run in the sender's async context. Capture the account selected
// when this server instance is created and restore it around each tool callback.
export function bindSpotifyAccount<Args extends unknown[], Result>(
  handler: (...args: Args) => Result,
): (...args: Args) => Result {
  const resolve = accounts.getStore();
  return resolve
    ? (...args) => withSpotifyAccount(resolve, () => handler(...args))
    : handler;
}
