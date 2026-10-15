import assert from 'node:assert/strict';
import { request } from 'node:http';
import test from 'node:test';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import {
  formatHost,
  httpOptionsFromEnv,
  isLoopbackAddress,
  serveHttp,
} from '../build/http.js';
import { createServer } from '../build/server.js';
import {
  accessToken,
  authFixture,
  mockSpotify,
  oauthClient,
  signIn,
} from './auth-helpers.js';

function rawRequest(
  port,
  {
    host = `127.0.0.1:${port}`,
    origin,
    pathname = '/mcp',
    method = 'GET',
    body,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path: pathname,
        headers: { Host: host, ...(origin ? { Origin: origin } : {}) },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

test('HTTP options and loopback address normalization', () => {
  assert.equal(httpOptionsFromEnv({}), undefined);
  assert.deepEqual(httpOptionsFromEnv({ MCP_TRANSPORT: 'http' }), {
    host: '127.0.0.1',
    port: 3000,
  });
  assert.deepEqual(
    httpOptionsFromEnv({
      MCP_TRANSPORT: 'http',
      MCP_HTTP_HOST: '0.0.0.0',
      MCP_HTTP_PORT: '8080',
    }),
    { host: '0.0.0.0', port: 8080 },
  );
  for (const port of ['-1', '65536', 'x'])
    assert.throws(() =>
      httpOptionsFromEnv({ MCP_TRANSPORT: 'http', MCP_HTTP_PORT: port }),
    );
  for (const host of ['127.0.0.2', '::1', '[::1]', '::ffff:127.0.0.1'])
    assert.equal(isLoopbackAddress(host), true);
  for (const host of ['0.0.0.0', '::', '10.0.0.1', 'localhost'])
    assert.equal(isLoopbackAddress(host), false);
  assert.equal(formatHost('::1'), '[::1]');
});

test('HTTP requires OAuth, validates Host/Origin, bounds request bodies and keeps health public', async (t) => {
  const f = await authFixture(t);
  const server = await serveHttp(
    createServer,
    { host: '127.0.0.1', port: 0 },
    f,
  );
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  assert.equal(await rawRequest(port), 401);
  assert.equal(await rawRequest(port, { host: 'attacker.example' }), 403);
  assert.equal(
    await rawRequest(port, { origin: 'https://attacker.example' }),
    403,
  );
  assert.equal(
    await rawRequest(port, { pathname: '/health', host: 'internal-container' }),
    200,
  );
  assert.equal(
    await rawRequest(port, {
      pathname: '/api/auth/sign-in/social',
      method: 'POST',
      body: 'x'.repeat(70_000),
    }),
    413,
  );
  assert.equal(await rawRequest(port, { pathname: '/health' }), 200);
});

test('real MCP SDK client uses OAuth-protected HTTP and its own Spotify account', async (t) => {
  mockSpotify(t);
  const f = await authFixture(t);
  const user = await signIn(f, 'alice');
  const oauth = await oauthClient(f, user.cookie);
  const tokens = await accessToken(f, oauth, user.cookie);
  const client = new Client(
    { name: 'spotify-http-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  t.after(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(f.resource), {
      requestInit: {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    }),
  );
  const { tools } = await client.listTools();
  assert.ok(tools.some((tool) => tool.name === 'getAvailableDevices'));
  const result = await client.callTool({
    name: 'getAvailableDevices',
    arguments: {},
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.match(JSON.stringify(result), /alice's speaker/);
});

test('sign-in rejects cross-origin POSTs and sends separate state/session cookies', async (t) => {
  mockSpotify(t);
  const f = await authFixture(t);
  const foreign = await f.request('/api/auth/sign-in/social', {
    method: 'POST',
    headers: {
      origin: 'https://attacker.example',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ provider: 'spotify', callbackURL: '/' }),
  });
  assert.equal(foreign.status, 403);
  const start = await f.post('/api/auth/sign-in/social', {
    provider: 'spotify',
    callbackURL: '/',
  });
  const state = new URL((await start.json()).url).searchParams.get('state');
  const response = await f.request(
    `/api/auth/callback/spotify?state=${state}&code=alice`,
    {
      headers: {
        cookie: start.headers
          .getSetCookie()
          .map((s) => s.split(';')[0])
          .join('; '),
      },
    },
  );
  assert.ok(response.headers.getSetCookie().length >= 2);
  assert.ok(
    response.headers
      .getSetCookie()
      .some((cookie) => cookie.startsWith('better-auth.session_token=')),
  );
});
