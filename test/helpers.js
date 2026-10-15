import assert from 'node:assert/strict';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { withSpotifyAccount } from '../build/request-context.js';
import { createServer } from '../build/server.js';

let resolveToken = async () => {
  throw new Error('No test Spotify account');
};

export function mockConfig(t, overrides = {}) {
  const config = { accessToken: 'test-access', ...overrides };
  resolveToken = async () => config.accessToken;
  t.after(() => {
    resolveToken = async () => {
      throw new Error('No test Spotify account');
    };
  });
  return () => config;
}

export function mockHttp(t, expected) {
  let index = 0;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const request = new Request(input, options);
    const body = await request.text();
    requests.push({ url: request.url, method: request.method, body });
    const step = expected[index++];
    assert.ok(step, `Unexpected request: ${request.method} ${request.url}`);
    assert.equal(
      request.url,
      step.url.startsWith('https:')
        ? step.url
        : `https://api.spotify.com/v1/${step.url}`,
    );
    assert.equal(request.method, step.method ?? 'GET');
    assert.equal(
      request.headers.get('authorization'),
      step.authorization ?? 'Bearer test-access',
    );
    if (step.body !== undefined) assert.deepEqual(JSON.parse(body), step.body);
    if (step.form)
      assert.deepEqual(
        Object.fromEntries(new URLSearchParams(body)),
        step.form,
      );
    return new Response(
      step.response === undefined ? null : JSON.stringify(step.response),
      {
        status: step.status ?? (step.response === undefined ? 204 : 200),
        headers: { 'Content-Type': 'application/json' },
      },
    );
  });
  t.after(() => assert.equal(index, expected.length, JSON.stringify(requests)));
}

export async function connect(t, mode = 'legacy') {
  const client = new Client(
    { name: 'spotify-test', version: '1.0.0' },
    { versionNegotiation: { mode } },
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = serveStdio(
    () => withSpotifyAccount(() => resolveToken(), createServer),
    { transport: serverTransport },
  );
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await client.connect(clientTransport);
  return client;
}

export function resultText(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.ok(result.content.length > 0);
  return result.content
    .map((item) => {
      assert.equal(item.type, 'text');
      return item.text;
    })
    .join('\n');
}

export function setEnv(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}
