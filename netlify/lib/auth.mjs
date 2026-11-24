// Checks the Supabase access token the app sends, so only signed-in people can use the functions.
// Valid tokens are remembered for a few minutes to keep bulk TMDB matching fast.
const seen = new Map(); // token -> { email, until }

export async function userFromRequest(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const hit = seen.get(token);
  if (hit && hit.until > Date.now()) return hit;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_KEY are not set in Netlify.');
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const user = await res.json();
  const out = { email: (user.email || '').toLowerCase(), until: Date.now() + 5 * 60 * 1000 };
  if (seen.size > 200) seen.clear();
  seen.set(token, out);
  return out;
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
