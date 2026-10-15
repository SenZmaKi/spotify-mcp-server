import assert from 'node:assert/strict';
import test from 'node:test';
import { serveHttp } from '../build/http.js';
import { createServer } from '../build/server.js';
import { loadSpotifyConfig } from '../build/utils.js';
import { mockConfig, mockHttp, setEnv } from './helpers.js';

const secret = 'a'.repeat(64);
async function start(t) {
  const config = mockConfig(t);
  setEnv(t, {
    MCP_API_TOKEN: secret,
    MCP_AUTH: 'token',
    SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:3000/callback',
  });
  const server = await serveHttp(createServer, { host: '127.0.0.1', port: 0 });
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return { config, base: `http://127.0.0.1:${server.address().port}` };
}

test('MCP requires the configured token; the secret is not forwarded to Spotify', async (t) => {
  const { base } = await start(t);
  for (const token of ['', 'Bearer incorrect', `Bearer ${secret}x`]) {
    assert.equal(
      (await fetch(`${base}/mcp`, { headers: { Authorization: token } }))
        .status,
      401,
    );
  }
  const response = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    }),
  });
  assert.equal(response.status, 200);
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test('web login requires a secret, binds state to a cookie, and saves only tokens', async (t) => {
  const { base, config } = await start(t);
  const page = await fetch(base);
  assert.equal(page.headers.get('referrer-policy'), 'same-origin');
  assert.equal(
    (await fetch(`${base}/connect`, { method: 'POST', body: 'token=wrong' }))
      .status,
    401,
  );
  const login = await fetch(`${base}/connect`, {
    method: 'POST',
    body: `token=${secret}`,
    headers: { Origin: 'http://127.0.0.1:3000' },
    redirect: 'manual',
  });
  assert.equal(login.status, 303);
  const state = new URL(login.headers.get('location')).searchParams.get(
    'state',
  );
  const callback = `${base}/callback?code=code&state=${state}`;
  assert.equal((await fetch(callback)).status, 400);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const realFetch = globalThis.fetch;
  mockHttp(t, [
    {
      url: 'https://accounts.spotify.com/api/token',
      method: 'POST',
      authorization: `Basic ${Buffer.from('test-client:test-secret').toString('base64')}`,
      form: {
        grant_type: 'authorization_code',
        code: 'code',
        redirect_uri: 'http://127.0.0.1:3000/callback',
      },
      response: {
        access_token: 'connected',
        refresh_token: 'refresh',
        expires_in: 3600,
      },
    },
  ]);
  assert.equal(
    (await realFetch(callback, { headers: { Cookie: cookie } })).status,
    200,
  );
  assert.equal(config().accessToken, 'connected');
  assert.equal(config().clientSecret, undefined);
  assert.equal(loadSpotifyConfig().clientSecret, 'test-secret');
  assert.equal(
    (await realFetch(callback, { headers: { Cookie: cookie } })).status,
    400,
  );
});

test('token mode fails closed without a secret', async (t) => {
  setEnv(t, { MCP_AUTH: 'token', MCP_API_TOKEN: undefined });
  await assert.rejects(
    serveHttp(createServer, { host: '127.0.0.1', port: 0 }),
    /MCP_API_TOKEN/,
  );
});

test('web login rejects foreign origins and a different Spotify account', async (t) => {
  const { base, config } = await start(t);
  setEnv(t, { SPOTIFY_USER_ID: 'owner' });
  assert.equal(
    (
      await fetch(`${base}/connect`, {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
        body: `token=${secret}`,
      })
    ).status,
    403,
  );
  const login = await fetch(`${base}/connect`, {
    method: 'POST',
    body: `token=${secret}`,
    headers: { Origin: 'http://127.0.0.1:3000' },
    redirect: 'manual',
  });
  const state = new URL(login.headers.get('location')).searchParams.get(
    'state',
  );
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const realFetch = globalThis.fetch;
  mockHttp(t, [
    {
      url: 'https://accounts.spotify.com/api/token',
      method: 'POST',
      authorization: `Basic ${Buffer.from('test-client:test-secret').toString('base64')}`,
      response: {
        access_token: 'other-access',
        refresh_token: 'other-refresh',
        expires_in: 3600,
      },
    },
    {
      url: 'me',
      authorization: 'Bearer other-access',
      response: { id: 'someone-else' },
    },
  ]);
  assert.equal(
    (
      await realFetch(`${base}/callback?state=${state}&code=code`, {
        headers: { Cookie: cookie },
      })
    ).status,
    403,
  );
  assert.equal(config().accessToken, 'test-access');
});

test('web login expires after ten minutes', async (t) => {
  const { base } = await start(t);
  const login = await fetch(`${base}/connect`, {
    method: 'POST',
    body: `token=${secret}`,
    headers: { Origin: 'http://127.0.0.1:3000' },
    redirect: 'manual',
  });
  const state = new URL(login.headers.get('location')).searchParams.get(
    'state',
  );
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 600_001);
  assert.equal(
    (
      await fetch(`${base}/callback?state=${state}&code=code`, {
        headers: { Cookie: cookie },
      })
    ).status,
    400,
  );
});
