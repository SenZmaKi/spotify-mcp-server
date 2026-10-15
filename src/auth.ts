import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { jwt } from 'better-auth/plugins';
import { SPOTIFY_SCOPES } from './utils.js';

export function authSettings(env: NodeJS.ProcessEnv = process.env) {
  const required = (key: string) => {
    const value = env[key];
    if (!value) throw new Error(`Set ${key}.`);
    return value;
  };
  const url = new URL(required('BETTER_AUTH_URL'));
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['127.0.0.1', '[::1]'].includes(url.hostname)
      ))
  ) {
    throw new Error(
      'BETTER_AUTH_URL must be an HTTPS origin (or loopback HTTP).',
    );
  }
  const secret = required('BETTER_AUTH_SECRET');
  if (secret.length < 32)
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.');
  return {
    baseURL: url.origin,
    secret,
    clientId: required('SPOTIFY_CLIENT_ID'),
    clientSecret: required('SPOTIFY_CLIENT_SECRET'),
    databasePath: env.DATABASE_PATH || './data/spotify.sqlite',
  };
}

export async function createAuth(settings = authSettings()) {
  const directory = path.dirname(settings.databasePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(settings.databasePath);
  fs.chmodSync(settings.databasePath, 0o600);
  database.exec(
    'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;',
  );
  const resource = `${settings.baseURL}/mcp`;
  const options = {
    appName: 'Spotify MCP',
    baseURL: settings.baseURL,
    secret: settings.secret,
    database,
    trustedOrigins: [settings.baseURL],
    rateLimit: { enabled: true, storage: 'database' },
    disabledPaths: ['/token', '/get-access-token', '/refresh-token'],
    // Do not allow email matching to merge unrelated Spotify identities.
    account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
    socialProviders: {
      spotify: {
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
        scope: [...SPOTIFY_SCOPES],
      },
    },
    plugins: [
      jwt(),
      mcp({
        loginPage: '/sign-in',
        consentPage: '/consent',
        resource,
        scopes: ['openid', 'profile', 'offline_access', 'spotify:tools'],
        grantTypes: ['authorization_code', 'refresh_token'],
        accessTokenExpiresIn: 15 * 60,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
    ],
  } satisfies BetterAuthOptions;
  try {
    const migrations = await getMigrations(options);
    await migrations.runMigrations();
  } catch (error) {
    database.close();
    throw error;
  }
  const auth = betterAuth(options);
  try {
    await auth.$context;
  } catch (error) {
    database.close();
    throw error;
  }
  // Serialize refreshes per user only. Different users never share tokens or
  // in-flight work. Better Auth persists token rotation in the account table.
  const pending = new Map<string, Promise<string>>();
  function spotifyToken(userId: string): Promise<string> {
    let result = pending.get(userId);
    if (!result) {
      result = (async () => {
        const context = await auth.$context;
        const account = (
          await context.internalAdapter.findAccounts(userId)
        ).find((account) => account.providerId === 'spotify');
        if (!account)
          throw new Error('Reconnect Spotify on the server sign-in page.');
        return auth.api.getAccessToken({
          body: { accountId: account.id, userId },
        });
      })()
        .then(({ accessToken }) => {
          if (!accessToken)
            throw new Error('Reconnect Spotify on the server sign-in page.');
          return accessToken;
        })
        .finally(() => pending.delete(userId));
      pending.set(userId, result);
    }
    return result;
  }
  return { auth, database, resource, baseURL: settings.baseURL, spotifyToken };
}

export type AuthRuntime = Awaited<ReturnType<typeof createAuth>>;
