import assert from 'node:assert/strict';
import test from 'node:test';
import { authSettings } from '../build/auth.js';
import {
  accessToken,
  authFixture,
  authorizationParams,
  authorize,
  cookieHeader,
  exchange,
  mockSpotify,
  oauthClient,
  signIn,
} from './auth-helpers.js';

const headers = (token, name = 'getAvailableDevices') => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2026-07-28',
  'mcp-method': 'tools/call',
  'mcp-name': name,
});
async function tool(f, token, name = 'getAvailableDevices', args = {}) {
  const response = await f.request('/mcp', {
    method: 'POST',
    headers: headers(token, name),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const text = await response.text();
  return text.includes('data: ')
    ? JSON.parse(text.match(/data: (.*)/)[1])
    : JSON.parse(text);
}

test('configuration requires a stable secret, public origin and Spotify credentials', () => {
  assert.throws(() => authSettings({}), /BETTER_AUTH_URL/);
  for (const url of [
    'http://public.example',
    'https://example.com/path',
    'https://user:pass@example.com',
    'https://example.com?x=1',
  ])
    assert.throws(() => authSettings({ BETTER_AUTH_URL: url }), /HTTPS origin/);
  assert.throws(
    () =>
      authSettings({
        BETTER_AUTH_URL: 'https://example.com',
        BETTER_AUTH_SECRET: 'short',
      }),
    /32 characters/,
  );
});

test('OAuth discovery advertises CIMD, PKCE, resource binding and user-only grants', async (t) => {
  const f = await authFixture(t);
  const resource = await (
    await f.request('/.well-known/oauth-protected-resource/mcp')
  ).json();
  assert.equal(resource.resource, f.resource);
  assert.deepEqual(resource.authorization_servers, [`${f.baseURL}/api/auth`]);
  const meta = await (
    await f.request('/.well-known/oauth-authorization-server/api/auth')
  ).json();
  assert.equal(meta.client_id_metadata_document_supported, true);
  assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(meta.grant_types_supported, [
    'authorization_code',
    'refresh_token',
  ]);
  assert.equal(meta.registration_endpoint, undefined);
  const denied = await f.request('/mcp');
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('www-authenticate'), /resource_metadata=/);
});

test('two users receive separate encrypted Spotify accounts and concurrent MCP tool results', async (t) => {
  const spotify = mockSpotify(t);
  const f = await authFixture(t);
  const alice = await signIn(f, 'alice');
  const bob = await signIn(f, 'bob');
  assert.notEqual(alice.user.id, bob.user.id);
  const client = await oauthClient(f, alice.cookie);
  const a = await accessToken(f, client, alice.cookie);
  const b = await accessToken(f, client, bob.cookie);
  const results = await Promise.all([
    tool(f, a.access_token),
    tool(f, b.access_token),
    tool(f, a.access_token, 'getMyPlaylists'),
    tool(f, b.access_token, 'getMyPlaylists'),
  ]);
  for (const [index, result] of results.entries()) {
    const expected = index % 2 ? 'bob' : 'alice';
    assert.match(JSON.stringify(result), new RegExp(`${expected}'s`));
    assert.doesNotMatch(
      JSON.stringify(result),
      new RegExp(`${index % 2 ? 'alice' : 'bob'}'s`),
    );
  }
  const accounts = f.database
    .prepare('SELECT accessToken, refreshToken FROM account')
    .all();
  assert.equal(accounts.length, 2);
  for (const row of accounts) {
    assert.ok(row.accessToken && row.refreshToken);
    assert.doesNotMatch(row.accessToken, /^access-/);
    assert.doesNotMatch(row.refreshToken, /^refresh-/);
  }
  // Extra user/account selectors in tool arguments cannot change the subject.
  const result = await tool(f, a.access_token, 'getAvailableDevices', {
    userId: bob.user.id,
    accountId: bob.user.id,
  });
  assert.match(JSON.stringify(result), /alice's/);
  assert.ok(spotify.calls.some((call) => call.token === 'Bearer access-bob'));
});

test('consent denial, signed query tampering, redirect mismatch and PKCE failures are rejected', async (t) => {
  mockSpotify(t);
  const f = await authFixture(t);
  const alice = await signIn(f, 'alice');
  const client = await oauthClient(f, alice.cookie);
  const { params } = authorizationParams(f, client);
  const start = await f.handle(
    new Request(`${f.baseURL}/api/auth/oauth2/authorize?${params}`, {
      headers: {
        cookie: alice.cookie,
        accept: 'text/html',
        'sec-fetch-mode': 'navigate',
      },
    }),
  );
  const consentURL = new URL(start.headers.get('location'), f.baseURL);
  const tampered = new URL(consentURL);
  tampered.searchParams.set('client_id', 'attacker');
  assert.equal(
    (
      await f.request(tampered.pathname + tampered.search, {
        headers: { cookie: alice.cookie },
      })
    ).status,
    400,
  );
  const denied = await f.post(
    '/api/auth/oauth2/consent',
    { accept: false, oauth_query: consentURL.search.slice(1) },
    alice.cookie,
  );
  const denial = await denied.json();
  assert.equal(
    new URL(denial.url || denial.redirect_uri).searchParams.get('error'),
    'access_denied',
  );
  const grant = await authorize(f, client, alice.cookie);
  assert.equal(
    (await exchange(f, client, grant, { code_verifier: 'wrong-verifier' }))
      .status,
    400,
  );
  const grant2 = await authorize(f, client, alice.cookie);
  assert.equal(
    (
      await exchange(f, client, grant2, {
        redirect_uri: 'https://attacker.example/callback',
      })
    ).status,
    400,
  );
  const grant3 = await authorize(f, client, alice.cookie);
  assert.equal(
    (
      await exchange(f, client, grant3, {
        resource: 'https://other.example/mcp',
      })
    ).status,
    400,
  );
});

test('authorization resumes across Spotify login and requires explicit consent', async (t) => {
  mockSpotify(t);
  const f = await authFixture(t);
  const owner = await signIn(f, 'owner');
  const client = await oauthClient(f, owner.cookie);
  const { params } = authorizationParams(f, client);
  const initial = await f.handle(
    new Request(`${f.baseURL}/api/auth/oauth2/authorize?${params}`, {
      headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' },
    }),
  );
  const login = new URL(initial.headers.get('location'), f.baseURL);
  assert.equal(login.pathname, '/sign-in');
  const bob = await signIn(f, 'bob', login.search.slice(1));
  const consent = new URL(bob.callback.headers.get('location'), f.baseURL);
  assert.equal(consent.pathname, '/consent');
  const screen = await f.request(consent.pathname + consent.search, {
    headers: { cookie: bob.cookie },
  });
  assert.equal(screen.status, 200);
  assert.match(await screen.text(), /Signed in as <strong>bob/);
  const forged = await f.post(
    '/api/auth/oauth2/consent',
    { accept: true, oauth_query: consent.search.slice(1) },
    '',
  );
  assert.equal(forged.status, 401);
});

test('MCP rejects spoofed tokens, missing scopes and deleted users', async (t) => {
  mockSpotify(t);
  const f = await authFixture(t);
  const alice = await signIn(f, 'alice');
  const client = await oauthClient(f, alice.cookie);
  for (const token of ['access-alice', 'old-static-mcp-secret', 'not.a.jwt'])
    assert.equal(
      (await f.request('/mcp', { headers: headers(token) })).status,
      401,
    );
  const limited = await accessToken(f, client, alice.cookie, {
    scope: 'openid',
  });
  assert.equal(
    (await f.request('/mcp', { headers: headers(limited.access_token) }))
      .status,
    403,
  );
  const valid = await accessToken(f, client, alice.cookie);
  f.database.prepare('DELETE FROM user WHERE id = ?').run(alice.user.id);
  assert.equal(
    (await f.request('/mcp', { headers: headers(valid.access_token) })).status,
    401,
  );
});

test('per-user Spotify refresh is serialized, rotates durably, and failures do not affect another user', async (t) => {
  const spotify = mockSpotify(t);
  const f = await authFixture(t);
  const alice = await signIn(f, 'alice');
  const bob = await signIn(f, 'bob');
  f.database
    .prepare('UPDATE account SET accessTokenExpiresAt = ?')
    .run('2000-01-01T00:00:00.000Z');
  const tokens = await Promise.all([
    f.spotifyToken(alice.user.id),
    f.spotifyToken(bob.user.id),
    f.spotifyToken(alice.user.id),
  ]);
  assert.deepEqual(tokens, ['renewed-alice', 'renewed-bob', 'renewed-alice']);
  assert.equal(
    spotify.calls.filter(
      (c) =>
        new URLSearchParams(c.body).get('refresh_token') === 'refresh-alice',
    ).length,
    1,
  );
  assert.equal(await f.spotifyToken(alice.user.id), 'renewed-alice');
  f.database
    .prepare('UPDATE account SET accessTokenExpiresAt = ? WHERE userId = ?')
    .run('2000-01-01T00:00:00.000Z', alice.user.id);
  spotify.refreshFailures.set('alice', 'invalid_grant');
  await assert.rejects(f.spotifyToken(alice.user.id));
  assert.equal(await f.spotifyToken(bob.user.id), 'renewed-bob');
  await assert.rejects(f.spotifyToken('nonexistent-user'));
});

test('Spotify OAuth callback rejects state replay and missing login cookies', async (t) => {
  mockSpotify(t);
  const f = await authFixture(t);
  const start = await f.post('/api/auth/sign-in/social', {
    provider: 'spotify',
    callbackURL: '/',
  });
  const state = new URL((await start.json()).url).searchParams.get('state');
  const invalid = await f.request(
    `/api/auth/callback/spotify?code=mallory&state=${state}`,
  );
  assert.match(invalid.headers.get('location'), /error=/);
  assert.equal(
    f.database.prepare('SELECT count(*) AS total FROM user').get().total,
    0,
  );
  const alice = await signIn(f, 'alice');
  const replay = await f.request(
    '/api/auth/callback/spotify?code=mallory&state=unknown',
    { headers: { cookie: cookieHeader(alice.callback) } },
  );
  assert.match(replay.headers.get('location'), /error=/);
});

test('SQLite preserves accounts, sessions, signing keys and refresh grants after restart', async (t) => {
  mockSpotify(t);
  const f = await authFixture(t);
  const alice = await signIn(f, 'alice');
  const client = await oauthClient(f, alice.cookie);
  const grant = await authorize(f, client, alice.cookie);
  const response = await exchange(f, client, grant);
  assert.equal(response.status, 200);
  let issued = await response.json();
  assert.ok(issued.refresh_token);
  assert.equal(
    (await exchange(f, client, grant)).status,
    400,
    'authorization codes are single use',
  );
  // Reusing a code also invalidates its refresh grant. Issue a fresh grant
  // before testing persistence, rather than relying on a revoked family.
  issued = await accessToken(f, client, alice.cookie);
  const keys = f.database.prepare('SELECT id FROM jwks').all();
  await f.restart();
  assert.deepEqual(f.database.prepare('SELECT id FROM jwks').all(), keys);
  assert.ok(
    await f.auth.api.getSession({
      headers: new Headers({ cookie: alice.cookie }),
    }),
  );
  assert.match(JSON.stringify(await tool(f, issued.access_token)), /alice's/);
  const refresh = await f.request('/api/auth/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: client.client_id,
      refresh_token: issued.refresh_token,
      resource: f.resource,
    }),
  });
  assert.equal(refresh.status, 200, await refresh.clone().text());
  const renewed = await refresh.json();
  assert.ok(renewed.refresh_token);
  assert.match(JSON.stringify(await tool(f, renewed.access_token)), /alice's/);
  assert.equal(
    (await f.post('/api/auth/sign-out', {}, alice.cookie)).status,
    200,
  );
  const loggedOut = await f.post('/api/auth/sign-out', {}, alice.cookie);
  assert.equal(loggedOut.status, 200);
});
