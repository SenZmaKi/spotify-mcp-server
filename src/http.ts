import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { BlockList, isIPv6 } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { requireMcpAuth } from '@better-auth/mcp';
import { hostHeaderValidation, toWebRequest } from '@modelcontextprotocol/node';
import {
  createMcpHandler,
  type McpServerFactory,
} from '@modelcontextprotocol/server';
import { type AuthRuntime, createAuth } from './auth.js';
import { withSpotifyAccount } from './request-context.js';
import { createWebAuth } from './web-auth.js';

export interface HttpOptions {
  host: string;
  port: number;
}

type Guard = (req: IncomingMessage, res: ServerResponse) => boolean;

export function httpOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): HttpOptions | undefined {
  if (env.MCP_TRANSPORT !== 'http') return undefined;
  const port = Number(env.MCP_HTTP_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid MCP_HTTP_PORT: ${env.MCP_HTTP_PORT}`);
  }
  return { host: env.MCP_HTTP_HOST || '127.0.0.1', port };
}

const loopback = new BlockList();
loopback.addSubnet('127.0.0.0', 8, 'ipv4');
loopback.addAddress('::1', 'ipv6');
loopback.addSubnet('::ffff:127.0.0.0', 104, 'ipv6');

export function isLoopbackAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  try {
    return loopback.check(ip, isIPv6(ip) ? 'ipv6' : 'ipv4');
  } catch {
    return false;
  }
}

export function formatHost(address: string): string {
  return isIPv6(address) ? `[${address}]` : address;
}

// The SDK's generic Node adapter flattens repeated Set-Cookie headers. OAuth
// needs every state/session cookie, so preserve them explicitly at this boundary.
export function toNodeAppHandler(
  fetchHandler: (request: Request) => Promise<Response>,
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const controller = new AbortController();
    res.once('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    try {
      const request = await toWebRequest(req, undefined, {
        signal: controller.signal,
        maxRequestBodySize: 64 * 1024,
      });
      const response = await fetchHandler(request);
      for (const [name, value] of response.headers) {
        if (name !== 'set-cookie') res.setHeader(name, value);
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
      res.writeHead(response.status);
      if (!response.body) res.end();
      else
        await pipeline(
          Readable.fromWeb(
            response.body as import('node:stream/web').ReadableStream,
          ),
          res,
        );
    } catch (error) {
      if (res.destroyed) return;
      if (!res.headersSent)
        res.writeHead(
          (error as { status?: number }).status === 413 ? 413 : 500,
        );
      res.end();
      if ((error as { status?: number }).status !== 413)
        console.error('HTTP request failed');
    }
  };
}

export function createHttpHandler(
  factory: McpServerFactory,
  runtime: AuthRuntime,
) {
  const onerror = () => console.error('MCP HTTP request failed');
  const mcpHandler = createMcpHandler(factory, { onerror, legacy: 'reject' });
  const protectedMcp = requireMcpAuth(
    runtime.auth,
    async (request, claims) => {
      if (typeof claims.sub !== 'string' || !claims.sub)
        return new Response('User authorization required', { status: 401 });
      const userId = claims.sub;
      // Never accept a user ID, Spotify token, or account selector from MCP arguments.
      const context = await runtime.auth.$context;
      if (!(await context.internalAdapter.findUserById(userId)))
        return new Response('User no longer exists', { status: 401 });
      return withSpotifyAccount(
        () => runtime.spotifyToken(userId),
        () => mcpHandler.fetch(request),
      );
    },
    { resource: runtime.resource, requiredScopes: ['spotify:tools'] },
  );
  const web = createWebAuth(runtime);
  return async (input: Request): Promise<Response> => {
    const incoming = new URL(input.url);
    // Public origin is configuration, never an untrusted forwarded/Host header.
    const request = new Request(
      `${runtime.baseURL}${incoming.pathname}${incoming.search}`,
      input,
    );
    const url = new URL(request.url);
    // Browser session mutations must originate here. OAuth token endpoints are
    // called by independent clients and authenticate with their OAuth credentials.
    const clientEndpoints = new Set([
      '/api/auth/oauth2/token',
      '/api/auth/oauth2/introspect',
      '/api/auth/oauth2/revoke',
    ]);
    if (
      request.method === 'POST' &&
      url.pathname.startsWith('/api/auth/') &&
      !clientEndpoints.has(url.pathname) &&
      request.headers.get('origin') !== runtime.baseURL
    ) {
      return new Response('Invalid origin', { status: 403 });
    }
    let response: Response;
    if (url.pathname === '/health' && request.method === 'GET')
      response = new Response('ok');
    else if (url.pathname === '/mcp') response = await protectedMcp(request);
    else if (
      url.pathname.startsWith('/api/auth/') ||
      url.pathname.startsWith('/.well-known/')
    )
      response = await runtime.auth.handler(request);
    else
      response =
        (await web(request)) ?? new Response('Not found', { status: 404 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    return response;
  };
}

export async function serveHttp(
  factory: McpServerFactory,
  { host, port }: HttpOptions,
  suppliedRuntime?: AuthRuntime,
): Promise<Server> {
  const runtime = suppliedRuntime ?? (await createAuth());
  const handle = toNodeAppHandler(createHttpHandler(factory, runtime));
  const publicHostname = new URL(runtime.baseURL).hostname;
  let guards: Guard[] = [hostHeaderValidation([publicHostname])];
  const server = createHttpServer((req, res) => {
    // Health checks from the container need no public Host header.
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200).end('ok');
      return;
    }
    if (!guards.every((guard) => guard(req, res))) return;
    if (
      req.url?.split('?')[0] === '/mcp' &&
      req.headers.origin &&
      req.headers.origin !== runtime.baseURL
    ) {
      res.writeHead(403).end('Invalid origin');
      return;
    }
    void handle(req, res);
  });
  server.once('listening', () => {
    const bound = server.address();
    if (
      typeof bound === 'object' &&
      bound &&
      isLoopbackAddress(bound.address)
    ) {
      guards = [
        hostHeaderValidation([
          publicHostname,
          'localhost',
          '127.0.0.1',
          '[::1]',
        ]),
      ];
    }
  });
  if (!suppliedRuntime) server.once('close', () => runtime.database.close());
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
    return server;
  } catch (error) {
    if (!suppliedRuntime) runtime.database.close();
    throw error;
  }
}
