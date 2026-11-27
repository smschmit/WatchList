// TMDB proxy: keeps the TMDB token on the server. Only signed-in users, only the lookups the app uses.
// GET /.netlify/functions/tmdb?path=/search/tv&query=...
import { userFromRequest, json } from '../lib/auth.mjs';

const ALLOWED = [
  /^\/search\/(tv|movie|multi|person)$/,
  /^\/(tv|movie)\/\d+$/,
  /^\/(tv|movie)\/\d+\/images$/,
  /^\/tv\/\d+\/season\/\d+$/,
  /^\/(tv|movie)\/\d+\/keywords$/,
  /^\/(tv|movie)\/\d+\/(recommendations|similar)$/,
  /^\/(tv|movie)\/\d+\/watch\/providers$/,
  /^\/watch\/providers\/(tv|movie)$/,
  /^\/tv\/\d+\/aggregate_credits$/,
  /^\/movie\/\d+\/credits$/,
  /^\/person\/\d+(\/combined_credits)?$/,
];

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405);
  const url = new URL(req.url);
  const path = url.searchParams.get('path') || '';
  if (!ALLOWED.some((r) => r.test(path))) return json({ error: 'Lookup not allowed' }, 400);
  let user;
  try { user = await userFromRequest(req); } catch (e) { return json({ error: e.message }, 500); }
  if (!user) return json({ error: 'Sign in first' }, 401);
  const token = process.env.TMDB_TOKEN;
  if (!token) return json({ error: 'TMDB_TOKEN is not set in Netlify' }, 500);

  const params = new URLSearchParams(url.searchParams);
  params.delete('path');
  if (!params.has('language')) params.set('language', 'en-US');
  let res;
  try {
    res = await fetch(`https://api.themoviedb.org/3${path}?${params}`, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    });
  } catch (e) {
    return json({ error: `Could not reach TMDB: ${e.message}` }, 502);
  }
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=3600' },
  });
};
