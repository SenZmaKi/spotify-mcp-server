import type { AddressInfo } from 'node:net';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { formatHost, httpOptionsFromEnv, serveHttp } from './http.js';
import { withSpotifyAccount } from './request-context.js';
import { createServer } from './server.js';

const http = httpOptionsFromEnv();
if (http) {
  const server = await serveHttp(createServer, http);
  const { port } = server.address() as AddressInfo;
  console.error(
    `Spotify MCP listening on http://${formatHost(http.host)}:${port}/mcp (OAuth required)`,
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => server.close());
  }
} else {
  // stdio is a local trusted process. Account selection must be explicit;
  // never pick the first user's Spotify credentials from a shared database.
  let runtime:
    | Promise<Awaited<ReturnType<typeof import('./auth.js').createAuth>>>
    | undefined;
  const resolveToken = async () => {
    const userId = process.env.SPOTIFY_LOCAL_USER_ID;
    if (!userId)
      throw new Error(
        'Set SPOTIFY_LOCAL_USER_ID to a signed-in Better Auth user ID for stdio.',
      );
    runtime ??= import('./auth.js').then(({ createAuth }) => createAuth());
    return (await runtime).spotifyToken(userId);
  };
  serveStdio(() => withSpotifyAccount(resolveToken, createServer), {
    onerror() {
      console.error('MCP transport error');
    },
  });
}
