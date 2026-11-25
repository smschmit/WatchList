// TMDB lookups through the Netlify function in netlify/functions/tmdb.mjs, and turning TMDB data into the list's columns.
import { factsFromDetails, initialLabel } from './facts.js';

export const CACHE_KEY = 'watchlist:tmdb-cache';

export const cfg = window.WATCHLIST_CONFIG || {};

// ---------- TMDB ----------
// Responses are cached on this device (not synced) so pages open fast and work offline.
export const memCache = new Map();
export function cacheGet(key) {
  if (memCache.has(key)) return memCache.get(key);
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const hit = all[key];
    if (hit && Date.now() - hit.t < 7 * 864e5) { memCache.set(key, hit.v); return hit.v; }
  } catch {}
  return undefined;
}
export function cacheSet(key, v) {
  memCache.set(key, v);
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[key] = { t: Date.now(), v };
    const keys = Object.keys(all);
    if (keys.length > 120) keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - 120).forEach((k) => delete all[k]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {}
}
export async function tmdb(path, params = {}) {
  const qs = new URLSearchParams(params);
  let res;
  if (window.tmdbMock) return window.tmdbMock(path, params); // used by local tests
  if (cfg.tmdbDevToken && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    res = await fetch(`https://api.themoviedb.org/3${path}?${qs}`, { headers: { Authorization: `Bearer ${cfg.tmdbDevToken}` } });
  } else {
    const token = window.cloud && window.cloud.token && await window.cloud.token();
    if (!token) throw new Error('Sign in to look things up on TMDB.');
    qs.set('path', path);
    res = await fetch(`/.netlify/functions/tmdb?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const why = body.error || body.status_message || (res.status === 429 ? 'TMDB is busy, try again in a moment' : '');
    throw new Error(`TMDB lookup failed (${res.status})${why ? `: ${why}` : ''}`);
  }
  return res.json();
}
export async function cached(key, fn) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  const v = await fn();
  cacheSet(key, v);
  return v;
}
export function getCast(t) {
  return cached(`cast:${t.type}:${t.id}`, async () => {
    const d = await tmdb(t.type === 'tv' ? `/tv/${t.id}/aggregate_credits` : `/movie/${t.id}/credits`);
    return (d.cast || []).slice(0, 40).map((c) => ({
      id: c.id, name: c.name, profile: c.profile_path,
      character: c.character || (c.roles || []).map((x) => x.character).filter(Boolean).slice(0, 2).join(' / '),
      episodes: c.total_episode_count || null,
    }));
  });
}
export const SKIP_GENRES = [10767, 10763]; // talk shows, news
export function getPerson(pid) {
  return cached(`person:${pid}`, async () => {
    const [p, c] = await Promise.all([tmdb(`/person/${pid}`), tmdb(`/person/${pid}/combined_credits`)]);
    const seen = new Map();
    for (const x of c.cast || []) {
      const type = x.media_type;
      if (type !== 'tv' && type !== 'movie') continue;
      const k = `${type}:${x.id}`;
      const date = x.first_air_date || x.release_date || '';
      const item = seen.get(k) || {
        id: x.id, type, title: x.name || x.title, year: date ? Number(date.slice(0, 4)) : null, poster: x.poster_path,
        character: '', episodes: 0, popularity: x.popularity || 0,
        appearance: SKIP_GENRES.some((g) => (x.genre_ids || []).includes(g)) || /\b(self|himself|herself|themselves)\b/i.test(x.character || ''),
      };
      if (x.character && !item.character.includes(x.character)) item.character = [item.character, x.character].filter(Boolean).join(' / ');
      item.episodes += x.episode_count || 0;
      seen.set(k, item);
    }
    return { id: p.id, name: p.name, profile: p.profile_path, bio: p.biography || '', known: p.known_for_department || '',
      credits: [...seen.values()].sort((a, b) => (b.year || 0) - (a.year || 0)) };
  });
}

export async function searchTmdb(query, type) {
  return (await searchTmdbPage(query, type)).hits;
}
// One page of search results, plus whether TMDB has more. Kept in memory only (not localStorage):
// search-as-you-type makes many throwaway queries that would push details and people out of the saved cache.
const searchCache = new Map();
export async function searchTmdbPage(query, type, page = 1) {
  const key = `${type}:${page}:${query.trim().toLowerCase()}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.t < 864e5) return hit.v;
  const d = await tmdb(`/search/${type}`, { query, include_adult: 'false', ...(page > 1 ? { page: String(page) } : {}) });
  const hits = (d.results || []).filter((x) => type !== 'multi' || x.media_type === 'tv' || x.media_type === 'movie').map((x) => {
    const t = type === 'multi' ? x.media_type : type;
    const date = x.first_air_date || x.release_date || '';
    return { id: x.id, type: t, title: x.name || x.title, original: x.original_name || x.original_title, year: date ? Number(date.slice(0, 4)) : null,
      poster: x.poster_path, overview: x.overview || '', popularity: x.popularity || 0 };
  });
  const v = { hits, more: (d.page || page) < (d.total_pages || 1) };
  searchCache.set(key, { t: Date.now(), v });
  if (searchCache.size > 200) searchCache.delete(searchCache.keys().next().value);
  return v;
}

// Turn TMDB details into the sheet's columns.
export const regionName = (() => {
  let dn; try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch {}
  const short = { US: 'US', GB: 'UK', CA: 'Canada', AU: 'Australia', NZ: 'NZ', KR: 'South Korea' };
  return (c) => short[c] || (dn ? dn.of(c) : c);
})();
export const langName = (() => {
  let dn; try { dn = new Intl.DisplayNames(['en'], { type: 'language' }); } catch {}
  return (c) => (dn && c ? dn.of(c) : c || '');
})();
export function splitGenres(gs) {
  const out = [];
  for (const g of gs || []) for (let part of g.name.split(' & ')) {
    if (part === 'Science Fiction') part = 'Sci-Fi';
    if (part === 'Politics') part = 'Political';
    if (!out.includes(part)) out.push(part);
  }
  return out;
}
export function getDetails(t) {
  return cached(`details:${t.type}:${t.id}`, () => tmdb(`/${t.type}/${t.id}`));
}
export async function detailsToShow(t, d) {
  d = d || await getDetails(t);
  if (t.type === 'tv') {
    const ended = /ended|canceled/i.test(d.status || '');
    const facts = factsFromDetails(d);
    return {
      title: d.name, format: d.type === 'Miniseries' ? 'Miniseries' : 'Series',
      year: d.first_air_date ? Number(d.first_air_date.slice(0, 4)) : null,
      endYear: ended && d.last_air_date ? Number(d.last_air_date.slice(0, 4)) : null,
      seasons: d.number_of_seasons || null, episodes: d.number_of_episodes || null,
      epLength: (d.episode_run_time && d.episode_run_time[0]) || (d.last_episode_to_air && d.last_episode_to_air.runtime) || null,
      showStatus: initialLabel(facts), facts,
      genres: splitGenres(d.genres), network: (d.networks && d.networks[0] && d.networks[0].name) || '',
      country: d.origin_country && d.origin_country[0] ? regionName(d.origin_country[0]) : '',
      languages: d.original_language ? [langName(d.original_language)] : [],
      tmdb: { id: d.id, type: 'tv', poster: d.poster_path },
    };
  }
  return {
    title: d.title, format: 'Movie', year: d.release_date ? Number(d.release_date.slice(0, 4)) : null,
    epLength: d.runtime || null, genres: splitGenres(d.genres),
    network: (d.production_companies && d.production_companies[0] && d.production_companies[0].name) || '',
    country: d.origin_country && d.origin_country[0] ? regionName(d.origin_country[0]) : (d.production_countries && d.production_countries[0] ? regionName(d.production_countries[0].iso_3166_1) : ''),
    languages: d.original_language ? [langName(d.original_language)] : [],
    tmdb: { id: d.id, type: 'movie', poster: d.poster_path },
  };
}
