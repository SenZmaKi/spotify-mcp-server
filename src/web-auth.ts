import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import type { AuthRuntime } from './auth.js';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] ?? char,
  );
}

function page(title: string, content: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Spotify MCP</title><link rel="stylesheet" href="/auth.css"><script src="/auth.js" defer></script><main><p class="brand">Spotify MCP</p><h1>${title}</h1>${content}<p id="error" role="alert"></p></main></html>`,
    {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}

const script = `
const error = document.querySelector('#error');
async function send(path, body) {
  const response = await fetch('/api/auth' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin', body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error_description || 'Could not complete the request. Try again.');
  return data;
}
document.querySelector('form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  const form = event.currentTarget;
  const oauthQuery = form.elements.oauth_query?.value;
  error.textContent = '';
  for (const item of form.querySelectorAll('button')) item.disabled = true;
  try {
    let data;
    if (form.dataset.action === 'consent') {
      data = await send('/oauth2/consent', { accept: button.value === 'accept', oauth_query: oauthQuery });
    } else if (form.dataset.action === 'sign-out') {
      await send('/sign-out', {});
      location.assign('/'); return;
    } else {
      data = await send('/sign-in/social', { provider: 'spotify', callbackURL: '/', errorCallbackURL: '/sign-in?error=spotify', ...(oauthQuery ? { oauth_query: oauthQuery } : {}) });
    }
    const destination = data.url || data.redirect_uri;
    if (!destination) throw new Error('The authorization response did not include a redirect. Start again.');
    location.assign(destination);
  } catch (failure) {
    error.textContent = failure.message;
    for (const item of form.querySelectorAll('button')) item.disabled = false;
  }
});
`;

export function createWebAuth(runtime: AuthRuntime) {
  return async (request: Request): Promise<Response | undefined> => {
    const url = new URL(request.url);
    if (request.method !== 'GET') return;
    if (url.pathname === '/auth.js')
      return new Response(script, {
        headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
      });
    if (url.pathname === '/auth.css')
      return new Response(
        `:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#111;color:#eee}body{margin:0;padding:24px}main{max-width:460px;margin:12vh auto;padding:32px;border:1px solid #333;border-radius:16px;background:#191919}h1{font-size:28px}.brand{color:#1ed760;font-weight:700}p{line-height:1.6}button{padding:12px 20px;border:0;border-radius:24px;background:#1ed760;color:#111;font:inherit;font-weight:650;cursor:pointer;margin:8px 8px 0 0}button[value=deny]{background:#333;color:#eee}button:disabled{opacity:.5}#error{color:#ffaaa0;overflow-wrap:anywhere}code{overflow-wrap:anywhere}`,
        { headers: { 'Content-Type': 'text/css; charset=utf-8' } },
      );
    if (!['/', '/sign-in', '/consent'].includes(url.pathname)) return;
    const query = url.search.slice(1);
    const oauthQuery = url.searchParams.has('sig') ? query : undefined;
    if (
      (oauthQuery || url.pathname === '/consent') &&
      !(await verifyOAuthQueryParams(
        query,
        (
          await runtime.auth.$context
        ).secret,
      ))
    ) {
      return new Response(
        'Invalid or expired authorization request. Start again from your MCP client.',
        { status: 400 },
      );
    }
    const session = await runtime.auth.api.getSession({
      headers: request.headers,
    });
    const hidden = oauthQuery
      ? `<input type="hidden" name="oauth_query" value="${escapeHtml(oauthQuery)}">`
      : '';
    if (url.pathname === '/consent') {
      if (!session)
        return new Response(
          'Your session expired. Start again from your MCP client.',
          { status: 401 },
        );
      return page(
        'Allow Spotify access?',
        `<p>Signed in as <strong>${escapeHtml(session.user.name)}</strong>.</p><p>Client <code>${escapeHtml(url.searchParams.get('client_id') || '')}</code> is requesting:</p><p><code>${escapeHtml(url.searchParams.get('scope') || '')}</code></p><p>This permits reading your Spotify library and listening activity, controlling playback, and changing your playlists and saved music.</p><form data-action="consent">${hidden}<button value="accept">Allow access</button><button value="deny">Deny</button></form>`,
      );
    }
    if (session && url.pathname === '/') {
      return page(
        'Spotify connected',
        `<p>Signed in as <strong>${escapeHtml(session.user.name)}</strong>. Connect your MCP client to <code>${escapeHtml(runtime.resource)}</code> using OAuth.</p><form data-action="sign-out"><button>Sign out</button></form>`,
      );
    }
    return page(
      'Connect your Spotify',
      `<p>Sign in to let your MCP client use your Spotify account. Your connection belongs only to you.</p>${url.searchParams.has('error') ? '<p>Spotify sign-in failed. Please try again.</p>' : ''}<form data-action="sign-in">${hidden}<button>Continue with Spotify</button></form>`,
    );
  };
}
