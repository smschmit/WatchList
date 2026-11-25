// Spotify proxy: keeps the Spotify app credentials on the server. Only signed-in users, only the lookups the app uses.
// Uses the Client Credentials flow (no Spotify sign-in): public catalog search and album/playlist names only.
//   GET /.netlify/functions/spotify?q=Severance soundtrack        -> { albums: [...], playlists: [...] }
//   GET /.netlify/functions/spotify?kind=album&id=<22-char id>    -> { item }
import { userFromRequest, json } from '../lib/auth.mjs';

let token = null; // { value, until }, reused across warm invocations

async function getToken() {
  if (token && token.until > Date.now()) return token.value;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    const err = new Error('Spotify search is not set up: add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Netlify.');
    err.status = 501;
    throw err;
  }
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) { const err = new Error(`Spotify sign-in failed (${res.status}). Check the client ID and secret.`); err.status = 502; throw err; }
  const d = await res.json();
  token = { value: d.access_token, until: Date.now() + (d.expires_in - 60) * 1000 };
  return token.value;
}

const img = (images) => (images && images.length ? (images[images.length > 1 ? 1 : 0] || images[0]).url : null);
const album = (a) => a && ({
  kind: 'album', id: a.id, name: a.name, url: a.external_urls && a.external_urls.spotify, image: img(a.images),
  by: (a.artists || []).map((x) => x.name).join(', '), albumType: a.album_type, year: Number((a.release_date || '').slice(0, 4)) || null,
  tracks: a.total_tracks || null,
});
const playlist = (p) => p && ({
  kind: 'playlist', id: p.id, name: p.name, url: p.external_urls && p.external_urls.spotify, image: img(p.images),
  by: (p.owner && p.owner.display_name) || '', ownerId: (p.owner && p.owner.id) || '', description: p.description || '',
  tracks: (p.tracks && p.tracks.total) || null,
});

async function spotify(path) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
  if (res.status === 401) token = null;
  if (!res.ok) { const err = new Error(`Spotify lookup failed (${res.status})${res.status === 429 ? ': too many requests, try again in a minute' : ''}`); err.status = res.status; throw err; }
  return res.json();
}

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405);
  let user;
  try { user = await userFromRequest(req); } catch (e) { return json({ error: e.message }, 500); }
  if (!user) return json({ error: 'Sign in first' }, 401);
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const kind = url.searchParams.get('kind');
  const id = url.searchParams.get('id') || '';
  try {
    if (q) {
      if (q.length > 200) return json({ error: 'Search is too long' }, 400);
      const d = await spotify(`/search?${new URLSearchParams({ q, type: 'album,playlist', limit: '10', market: 'US' })}`);
      return json({
        albums: ((d.albums && d.albums.items) || []).filter(Boolean).map(album),
        playlists: ((d.playlists && d.playlists.items) || []).filter(Boolean).map(playlist), // Spotify can return null entries here
      }, 200, { 'cache-control': 'private, max-age=86400' });
    }
    if ((kind === 'album' || kind === 'playlist') && /^[A-Za-z0-9]{22}$/.test(id)) {
      const d = kind === 'album' ? album(await spotify(`/albums/${id}?market=US`))
        : playlist(await spotify(`/playlists/${id}?fields=id,name,external_urls,images,owner(display_name,id),description,tracks(total)`));
      return json({ item: d }, 200, { 'cache-control': 'private, max-age=86400' });
    }
    return json({ error: 'Lookup not allowed' }, 400);
  } catch (e) {
    return json({ error: e.message }, e.status && e.status >= 400 ? e.status : 502);
  }
};
