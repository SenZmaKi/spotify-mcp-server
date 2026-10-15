import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createAuth } from '../build/auth.js';
import { createHttpHandler, toNodeAppHandler } from '../build/http.js';
import { createServer as createMcpServer } from '../build/server.js';

export const secret = 'abcdefghijklmnopqrstuvwxyz0123456789-test-secret';
export const cookieHeader = (response) =>
  response.headers
    .getSetCookie()
    .map((s) => s.split(';')[0])
    .join('; ');

export async function authFixture(t, { databasePath } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spotify-mcp-test-'));
  let handle;
  const server = createServer((req, res) => handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const settings = {
    baseURL,
    secret,
    clientId: 'test-client',
    clientSecret: 'test-secret',
    databasePath: databasePath ?? path.join(directory, 'auth.sqlite'),
  };
  let runtime = await createAuth(settings);
  handle = toNodeAppHandler(createHttpHandler(createMcpServer, runtime));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    runtime.database.close();
    fs.rmSync(directory, { recursive: true });
  });
  const fixture = {
    ...runtime,
    settings,
    server,
    handle: createHttpHandler(createMcpServer, runtime),
    restart: async () => {
      runtime.database.close();
      runtime = await createAuth(settings);
      const next = createHttpHandler(createMcpServer, runtime);
      handle = toNodeAppHandler(next);
      Object.assign(fixture, runtime, { handle: next });
    },
    request: (pathname, options = {}) =>
      fetch(baseURL + pathname, { redirect: 'manual', ...options }),
    post: (pathname, body, cookie = '') =>
      fetch(baseURL + pathname, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/json',
          origin: baseURL,
          cookie,
        },
        body: JSON.stringify(body),
      }),
  };
  return fixture;
}

export function mockSpotify(t) {
  const original = globalThis.fetch;
  const calls = [];
  const refreshFailures = new Map();
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!['accounts.spotify.com', 'api.spotify.com'].includes(url.hostname))
      return original(input, init);
    const req = new Request(input, init);
    const body = await req.text();
    calls.push({
      url: url.href,
      method: req.method,
      token: req.headers.get('authorization'),
      body,
    });
    if (url.hostname === 'accounts.spotify.com') {
      const params = new URLSearchParams(body);
      const refreshing = params.get('grant_type') === 'refresh_token';
      const identity = refreshing
        ? params.get('refresh_token').replace(/^(refresh|rotated)-/, '')
        : params.get('code');
      if (refreshing && refreshFailures.has(identity))
        return Response.json(
          { error: refreshFailures.get(identity) },
          { status: 400 },
        );
      return Response.json({
        access_token: `${refreshing ? 'renewed' : 'access'}-${identity}`,
        refresh_token: `${refreshing ? 'rotated' : 'refresh'}-${identity}`,
        expires_in: 3600,
        scope: 'user-read-email user-read-private',
        token_type: 'Bearer',
      });
    }
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    const identity = token?.replace(/^(access|renewed)-/, '');
    if (url.pathname === '/v1/me')
      return Response.json({
        id: identity,
        email: `${identity}@example.com`,
        display_name: identity,
        images: [],
      });
    if (url.pathname === '/v1/me/player/devices')
      return Response.json({
        devices: [
          {
            id: identity,
            name: `${identity}'s speaker`,
            type: 'Speaker',
            is_active: true,
            volume_percent: 50,
          },
        ],
      });
    if (url.pathname === '/v1/me/playlists')
      return Response.json({
        total: 1,
        items: [
          {
            id: `playlist-${identity}`,
            name: `${identity}'s playlist`,
            items: { total: 2 },
          },
        ],
      });
    throw new Error(`Unexpected Spotify request ${url}`);
  });
  return { calls, refreshFailures };
}

export async function signIn(fixture, identity, oauthQuery) {
  const start = await fixture.post('/api/auth/sign-in/social', {
    provider: 'spotify',
    callbackURL: '/',
    ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
  });
  assert.equal(start.status, 200, await start.clone().text());
  const target = new URL((await start.json()).url);
  assert.equal(
    target.searchParams.get('redirect_uri'),
    `${fixture.baseURL}/api/auth/callback/spotify`,
  );
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  const callback = await fixture.handle(
    new Request(
      `${fixture.baseURL}/api/auth/callback/spotify?code=${identity}&state=${target.searchParams.get('state')}`,
      {
        headers: {
          cookie: cookieHeader(start),
          accept: 'text/html',
          'sec-fetch-mode': 'navigate',
        },
      },
    ),
  );
  assert.equal(callback.status, 302, await callback.clone().text());
  const cookie = cookieHeader(callback);
  const session = await fixture.auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  assert.ok(session, callback.headers.get('location'));
  return { cookie, user: session.user, callback };
}

export async function oauthClient(fixture, cookie) {
  return fixture.auth.api.createOAuthClient({
    headers: new Headers({ cookie }),
    body: {
      client_name: 'Test MCP client',
      redirect_uris: ['https://client.example/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'openid offline_access spotify:tools',
    },
  });
}

export function authorizationParams(fixture, client, overrides = {}) {
  const verifier = randomBytes(32).toString('base64url');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: 'https://client.example/callback',
    scope: 'openid offline_access spotify:tools',
    resource: fixture.resource,
    state: 'client-state',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    ...overrides,
  });
  return { params, verifier };
}

export async function authorize(fixture, client, cookie, overrides) {
  const { params, verifier } = authorizationParams(fixture, client, overrides);
  const response = await fixture.handle(
    new Request(`${fixture.baseURL}/api/auth/oauth2/authorize?${params}`, {
      headers: { cookie, accept: 'text/html', 'sec-fetch-mode': 'navigate' },
    }),
  );
  assert.equal(response.status, 302, await response.clone().text());
  let destination = new URL(response.headers.get('location'), fixture.baseURL);
  if (destination.pathname === '/consent') {
    const consent = await fixture.post(
      '/api/auth/oauth2/consent',
      { accept: true, oauth_query: destination.search.slice(1) },
      cookie,
    );
    assert.equal(consent.status, 200, await consent.clone().text());
    const data = await consent.json();
    destination = new URL(data.url || data.redirect_uri, fixture.baseURL);
  }
  assert.equal(destination.searchParams.get('state'), 'client-state');
  assert.ok(destination.searchParams.get('code'), destination.href);
  return { code: destination.searchParams.get('code'), verifier };
}

export async function exchange(
  fixture,
  client,
  { code, verifier },
  overrides = {},
) {
  return fixture.request('/api/auth/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      code,
      code_verifier: verifier,
      redirect_uri: 'https://client.example/callback',
      resource: fixture.resource,
      ...overrides,
    }),
  });
}

export async function accessToken(fixture, client, cookie, overrides) {
  const response = await exchange(
    fixture,
    client,
    await authorize(fixture, client, cookie, overrides),
  );
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
