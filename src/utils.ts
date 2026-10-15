import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { getSpotifyRequestToken } from './request-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, '../spotify-tokens.json');

/**
 * The full scope set the tool surface actually needs. Used by the local
 * authorization flow and advertised in the RFC 9728 protected-resource
 * metadata (scopes_supported) so OAuth clients request exactly what the
 * server needs.
 */
export const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-playback-position',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
  'user-library-read',
  'user-library-modify',
  'user-read-recently-played',
  'user-top-read',
  'user-follow-read',
] as const;

/**
 * Registered by the HTTP transport in auth mode (see http.ts): called when
 * Spotify answers 401 for a token that already passed validation (the token
 * expired or was revoked mid-session), so the transport evicts it from its
 * validated-token memo and re-validates on the next request.
 */
let onSpotifyTokenRejected: ((accessToken: string) => void) | undefined;

export function setSpotifyTokenRejectedHook(
  hook: ((accessToken: string) => void) | undefined,
): void {
  onSpotifyTokenRejected = hook;
}

function reportSpotifyTokenRejected(accessToken: string): void {
  onSpotifyTokenRejected?.(accessToken);
}

export interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // Unix timestamp in milliseconds
}

export function loadSpotifyConfig(): SpotifyConfig {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!(clientId && clientSecret && redirectUri)) {
    throw new Error(
      'Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI.',
    );
  }
  const file = process.env.SPOTIFY_TOKEN_FILE || CONFIG_FILE;
  const tokens = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : {};
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    clientId,
    clientSecret,
    redirectUri,
  };
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

function resolveSymlinks(file: string): string {
  try {
    return fs.realpathSync(file);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  let isLink = false;
  try {
    isLink = fs.lstatSync(file).isSymbolicLink();
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  if (isLink) throw new Error(`${file} is a dangling symbolic link`);
  return file;
}

export function writeFileAtomic(file: string, data: string): void {
  const target = resolveSymlinks(file);
  let mode = 0o600;
  try {
    mode = fs.statSync(target).mode & 0o777;
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  const tmp = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  let owned = false;
  let fd: number | undefined;
  try {
    fd = fs.openSync(tmp, 'wx', mode);
    owned = true;
    fs.fchmodSync(fd, mode);
    fs.writeFileSync(fd, data, 'utf8');
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, target);
  } catch (error) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    if (owned) {
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }
    throw error;
  }
}

export function saveSpotifyConfig(config: SpotifyConfig): void {
  const file = process.env.SPOTIFY_TOKEN_FILE || CONFIG_FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileAtomic(
    file,
    JSON.stringify(
      {
        accessToken: config.accessToken,
        refreshToken: config.refreshToken,
        expiresAt: config.expiresAt,
      },
      null,
      2,
    ),
  );
  fs.chmodSync(file, 0o600);
}

let cachedSpotifyApi: SpotifyApi | null = null;
let cachedAccessToken: string | null = null;
let refreshInFlight: Promise<SpotifyConfig> | null = null;

function needsRefresh(config: SpotifyConfig, bufferMs: number): boolean {
  return Boolean(
    config.accessToken &&
      config.refreshToken &&
      (!config.expiresAt || config.expiresAt <= Date.now() + bufferMs),
  );
}

/**
 * Refreshes the access token unless the config on disk no longer needs it.
 * Concurrent callers in this process share one in-flight refresh, so a rotated
 * refresh token is never spent twice.
 */
function refreshSpotifyConfig(bufferMs: number): Promise<SpotifyConfig> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const latest = loadSpotifyConfig();
      if (!needsRefresh(latest, bufferMs)) return latest;
      console.error(
        'Access token expired or missing expiration time, refreshing...',
      );
      const now = Date.now();
      const tokens = await refreshAccessToken(latest);
      latest.accessToken = tokens.access_token;
      latest.expiresAt = now + tokens.expires_in * 1000;
      saveSpotifyConfig(latest);
      cachedSpotifyApi = null;
      console.error('Access token refreshed successfully');
      return latest;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Direct Spotify Web API fetch helper.
 * Used to bypass @spotify/web-api-ts-sdk methods that hit deprecated endpoints
 * (e.g. /playlists/{id}/tracks which was retired in the March 2026 API migration
 * for new Development Mode apps; replacement is /playlists/{id}/items).
 *
 * Handles token loading and refresh transparently.
 */
export async function spotifyFetch<T = unknown>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    query?: Record<string, string | number | undefined>;
  } = {},
): Promise<T> {
  const { method = 'GET', body, query } = options;
  // In HTTP auth mode (MCP_AUTH=spotify) the client supplies a fresh access
  // token per request; prefer it over the config-file flow.
  const bearerToken = getSpotifyRequestToken();
  let config = bearerToken ? null : loadSpotifyConfig();
  if (config && needsRefresh(config, 0)) {
    config = await refreshSpotifyConfig(0);
  }

  const accessToken = bearerToken ?? config?.accessToken;
  if (!accessToken) {
    throw new Error(
      'No access token available. Run "open the server web UI" to authenticate.',
    );
  }

  // Build URL with query string
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  let url = `https://api.spotify.com/v1/${cleanEndpoint}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.append(k, String(v));
    }
    const qsStr = qs.toString();
    if (qsStr) url += `?${qsStr}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    // Spotify rejected the per-request Bearer token (expired or revoked
    // after the transport-level /me check): report it so the transport
    // evicts it from the validation memo (see reportSpotifyTokenRejected).
    if (response.status === 401 && bearerToken) {
      reportSpotifyTokenRejected(bearerToken);
    }
    const errBody = await response.text();
    throw new Error(
      `Spotify API ${method} ${url} failed (${response.status}): ${errBody}`,
    );
  }

  // Some endpoints (DELETE, PUT) return empty body
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function createSpotifyApi(): Promise<SpotifyApi> {
  // HTTP auth mode: use the per-request Bearer token directly. It is a live
  // Spotify access token, so there is nothing to refresh here. No refresh
  // token is passed, which is fine: withAccessToken only uses it on 401.
  const bearerToken = getSpotifyRequestToken();
  if (bearerToken) {
    // Cache key is the hash of the full token so two different tokens can
    // never share a cached client, regardless of suffix collisions.
    const tokenKey = `request:${hashToken(bearerToken)}`;
    if (cachedSpotifyApi && cachedAccessToken === tokenKey) {
      return cachedSpotifyApi;
    }
    const baseFetch = globalThis.fetch;
    cachedSpotifyApi = SpotifyApi.withAccessToken(
      'request',
      {
        access_token: bearerToken,
        token_type: 'Bearer',
        expires_in: 3600,
        // No refresh token: the MCP client rotates tokens for us.
        refresh_token: undefined as unknown as string,
      },
      {
        // The SDK's response validator throws on non-2xx; detect the 401
        // here so a token Spotify has since expired or revoked is evicted
        // from the transport's validation memo (see
        // reportSpotifyTokenRejected) instead of being trusted forever.
        fetch: (input, init) =>
          baseFetch(input, init).then((response) => {
            if (response.status === 401) {
              reportSpotifyTokenRejected(bearerToken);
            }
            return response;
          }),
      },
    );
    cachedAccessToken = tokenKey;
    return cachedSpotifyApi;
  }

  const refreshBufferMs = 5 * 60 * 1000;
  let config = loadSpotifyConfig();
  if (needsRefresh(config, refreshBufferMs)) {
    try {
      config = await refreshSpotifyConfig(refreshBufferMs);
    } catch (error) {
      console.error('Failed to refresh token:', error);
      throw new Error(
        'Failed to refresh access token. Please run "open the server web UI" to re-authenticate.',
      );
    }
  }

  if (config.accessToken && config.refreshToken) {
    if (cachedSpotifyApi && cachedAccessToken === config.accessToken) {
      return cachedSpotifyApi;
    }

    const now = Date.now();
    const accessToken = {
      access_token: config.accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(
        ((config.expiresAt ?? now + 3600000) - now) / 1000,
      ),
      refresh_token: config.refreshToken,
    };

    cachedSpotifyApi = SpotifyApi.withAccessToken(config.clientId, accessToken);
    cachedAccessToken = config.accessToken;
    return cachedSpotifyApi;
  }

  throw new Error(
    'Spotify is not connected. Open the server web UI to connect your account.',
  );
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function base64Encode(str: string): string {
  return Buffer.from(str).toString('base64');
}

export async function exchangeCodeForToken(
  code: string,
  config: SpotifyConfig,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const authHeader = `Basic ${base64Encode(`${config.clientId}:${config.clientSecret}`)}`;

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', config.redirectUri);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to exchange code for token: ${errorData}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 3600,
  };
}

async function refreshAccessToken(
  config: SpotifyConfig,
): Promise<{ access_token: string; expires_in: number }> {
  if (!config.refreshToken) {
    throw new Error('No refresh token available');
  }

  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const authHeader = `Basic ${base64Encode(`${config.clientId}:${config.clientSecret}`)}`;

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', config.refreshToken);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const errorData = await response.text();
    let errorCode: string | undefined;
    try {
      errorCode = JSON.parse(errorData).error;
    } catch {
      // Non-JSON error body; treat as a generic, retryable failure.
    }

    // An expired (after 6 months) or revoked refresh token returns
    // invalid_grant. Discard the stored tokens so we never retry them; the
    // user has to sign in again to get a new refresh token.
    if (errorCode === 'invalid_grant') {
      config.accessToken = undefined;
      config.refreshToken = undefined;
      config.expiresAt = undefined;
      saveSpotifyConfig(config);
      throw new Error(
        'Spotify refresh token is no longer valid (invalid_grant) and has been discarded. Please run "open the server web UI" to re-authenticate.',
      );
    }

    throw new Error(`Failed to refresh access token: ${errorData}`);
  }

  const data = await response.json();

  // Spotify may rotate the refresh token on refresh; persist the new one so
  // the caller's saveSpotifyConfig() writes it back.
  if (data.refresh_token) {
    config.refreshToken = data.refresh_token;
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600,
  };
}

export async function validateSpotifyToken(accessToken: string): Promise<void> {
  const response = await fetch('https://api.spotify.com/v1/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) {
    const error = new Error('Spotify rejected the access token') as Error & {
      status?: number;
    };
    error.status = 401;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(
      `Spotify token validation failed (${response.status})`,
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}:${seconds.padStart(2, '0')}`;
}

export async function handleSpotifyRequest<T>(
  action: (spotifyApi: SpotifyApi) => Promise<T>,
): Promise<T> {
  try {
    const spotifyApi = await createSpotifyApi();
    return await action(spotifyApi);
  } catch (error) {
    // Skip JSON parsing errors as these are actually successful operations
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes('Unexpected token') ||
      errorMessage.includes('Unexpected non-whitespace character') ||
      errorMessage.includes('Exponent part is missing a number in JSON')
    ) {
      return undefined as T;
    }
    // Rethrow other errors
    throw error;
  }
}
