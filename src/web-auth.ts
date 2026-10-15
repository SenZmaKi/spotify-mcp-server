import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  exchangeCodeForToken,
  loadSpotifyConfig,
  SPOTIFY_SCOPES,
  saveSpotifyConfig,
} from './utils.js';

export function matchesSecret(value: string, secret: string): boolean {
  const hash = (text: string) => createHash('sha256').update(text).digest();
  return timingSafeEqual(hash(value), hash(secret));
}

export function createWebAuth(secret: string) {
  const config = loadSpotifyConfig();
  const redirect = new URL(config.redirectUri);
  if (
    redirect.username ||
    redirect.password ||
    redirect.pathname !== '/callback' ||
    redirect.search ||
    redirect.hash ||
    (redirect.protocol !== 'https:' &&
      !(
        redirect.protocol === 'http:' &&
        ['127.0.0.1', '[::1]'].includes(redirect.hostname)
      ))
  ) {
    throw new Error(
      'SPOTIFY_REDIRECT_URI must be HTTPS (or loopback HTTP), with path /callback and no query or fragment.',
    );
  }
  const pending = new Map<string, number>();
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<boolean> => {
    if (!['/', '/connect', '/callback'].includes(url.pathname)) return false;
    res.setHeader('Cache-Control', 'no-store');
    // Preserve the same-origin form Origin header in Firefox while keeping
    // callback codes and state out of cross-origin referrers.
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (url.pathname === '/' && req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        '<!doctype html><html lang="en"><title>Spotify MCP</title><h1>Connect Spotify</h1><p>Enter your MCP token to connect or reconnect your account.</p><form method="post" action="/connect"><label>MCP token <input name="token" type="password" required autocomplete="off"></label><button>Connect Spotify</button></form></html>',
      );
      return true;
    }
    if (url.pathname === '/connect' && req.method === 'POST') {
      if (req.headers.origin && req.headers.origin !== redirect.origin) {
        res.writeHead(403).end('Invalid origin');
        return true;
      }
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) {
          res.writeHead(413).end();
          return true;
        }
      }
      if (
        !matchesSecret(new URLSearchParams(body).get('token') ?? '', secret)
      ) {
        res.writeHead(401).end('Unauthorized');
        return true;
      }
      for (const [state, expires] of pending)
        if (expires <= Date.now()) pending.delete(state);
      if (pending.size >= 100) {
        res.writeHead(429).end('Try again later');
        return true;
      }
      const state = randomBytes(32).toString('hex');
      pending.set(state, Date.now() + 600_000);
      res.setHeader(
        'Set-Cookie',
        `spotify_state=${state}; HttpOnly; SameSite=Lax; Path=/callback; Max-Age=600${redirect.protocol === 'https:' ? '; Secure' : ''}`,
      );
      const params = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        redirect_uri: config.redirectUri,
        scope: SPOTIFY_SCOPES.join(' '),
        state,
      });
      res
        .writeHead(303, {
          Location: `https://accounts.spotify.com/authorize?${params}`,
        })
        .end();
      return true;
    }
    if (url.pathname === '/callback' && req.method === 'GET') {
      const state = url.searchParams.get('state') ?? '';
      const cookie = req.headers.cookie
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('spotify_state='))
        ?.slice(14);
      const expires = pending.get(state) ?? 0;
      if (!state || cookie !== state || expires <= Date.now()) {
        res.writeHead(400).end('Invalid or expired login. Start again.');
        return true;
      }
      pending.delete(state);
      res.setHeader(
        'Set-Cookie',
        'spotify_state=; HttpOnly; SameSite=Lax; Path=/callback; Max-Age=0',
      );
      const code = url.searchParams.get('code');
      if (!code || url.searchParams.has('error')) {
        res.writeHead(400).end('Spotify authorization denied.');
        return true;
      }
      try {
        const tokens = await exchangeCodeForToken(code, config);
        if (process.env.SPOTIFY_USER_ID) {
          const response = await fetch('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (
            !response.ok ||
            (await response.json()).id !== process.env.SPOTIFY_USER_ID
          ) {
            res.writeHead(403).end('Spotify account is not allowed.');
            return true;
          }
        }
        saveSpotifyConfig({
          ...config,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + tokens.expires_in * 1000,
        });
        res.end(
          'Spotify connected. You can close this page and use your MCP client.',
        );
      } catch {
        res.writeHead(502).end('Could not connect Spotify. Start again.');
      }
      return true;
    }
    res.writeHead(405).end();
    return true;
  };
}
