// TMDB lookups through the Netlify function in netlify/functions/tmdb.mjs, and turning TMDB data into the list's columns.
import { factsFromDetails, initialLabel } from './facts.js';
import { regionName, langName } from './sources.js';
import { TMDB_CACHE_KEY } from './util.js';

export const CACHE_KEY = TMDB_CACHE_KEY;
// Keep the saved cache under ~1 MB so it can't crowd out the list itself (all of localStorage is ~5 MB).
const CACHE_MAX_CHARS = 500_000;

export const cfg = window.WATCHLIST_CONFIG || {};

// ---------- TMDB ----------
// Responses are cached on this device (not synced) so pages open fast and work offline.
export const memCache = new Map();
// maxAge: how long a saved answer stays good (default 7 days). The in-memory copy lasts until the page reloads.
export function cacheGet(key, maxAge = 7 * 864e5) {
  const mem = memCache.get(key);
  if (mem && Date.now() - mem.t < maxAge) return mem.v;
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const hit = all[key];
    if (hit && Date.now() - hit.t < maxAge) { memCache.set(key, hit); return hit.v; }
  } catch {}
  return undefined;
}
export function cacheSet(key, v) {
  memCache.set(key, { t: Date.now(), v });
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[key] = { t: Date.now(), v };
    const keys = Object.keys(all);
    if (keys.length > 120) keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - 120).forEach((k) => delete all[k]);
    let json = JSON.stringify(all);
    if (json.length > CACHE_MAX_CHARS) {
      // Drop the oldest answers until it fits.
      const sizes = Object.keys(all).sort((a, b) => all[a].t - all[b].t).map((k) => [k, JSON.stringify(all[k]).length]);
      let total = json.length;
      for (const [k, n] of sizes) { if (total <= CACHE_MAX_CHARS) break; delete all[k]; total -= n; }
      json = JSON.stringify(all);
    }
    localStorage.setItem(CACHE_KEY, json);
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
export async function cached(key, fn, maxAge) {
  const hit = cacheGet(key, maxAge);
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
// Key bumped to person2 when billing order and vote counts were added, so older cached copies aren't used.
export function getPerson(pid) {
  return cached(`person2:${pid}`, async () => {
    const [p, c] = await Promise.all([tmdb(`/person/${pid}`), tmdb(`/person/${pid}/combined_credits`)]);
    const seen = new Map();
    for (const x of c.cast || []) {
      const type = x.media_type;
      if (type !== 'tv' && type !== 'movie') continue;
      const k = `${type}:${x.id}`;
      const date = x.first_air_date || x.release_date || '';
      const item = seen.get(k) || {
        id: x.id, type, title: x.name || x.title, year: date ? Number(date.slice(0, 4)) : null, poster: x.poster_path,
        character: '', episodes: 0, popularity: x.popularity || 0, voteCount: x.vote_count || 0, order: null,
        appearance: SKIP_GENRES.some((g) => (x.genre_ids || []).includes(g)) || /\b(self|himself|herself|themselves)\b/i.test(x.character || ''),
      };
      if (x.character && !item.character.includes(x.character)) item.character = [item.character, x.character].filter(Boolean).join(' / ');
      item.episodes += x.episode_count || 0;
      if (typeof x.order === 'number' && (item.order === null || x.order < item.order)) item.order = x.order;
      seen.set(k, item);
    }
    return { id: p.id, name: p.name, profile: p.profile_path, bio: p.biography || '', known: p.known_for_department || '',
      credits: [...seen.values()].sort((a, b) => (b.year || 0) - (a.year || 0)) };
  });
}

// How big a part was, from what combined_credits gives: episode count for TV, billing order for movies.
// TV: 2+ episodes is recurring, 1 is a guest spot. Movies: billed 1-3 is a lead, 4-8 supporting, lower a small role.
export const RECURRING_EPISODES = 2;
export function roleTier(c) {
  if (c.type === 'tv') return c.episodes >= RECURRING_EPISODES ? 'Recurring' : c.episodes === 1 ? 'Guest' : '';
  if (typeof c.order !== 'number') return '';
  return c.order <= 2 ? 'Lead' : c.order <= 7 ? 'Supporting' : 'Small role';
}
export const isMajorRole = (c) => ['Recurring', 'Lead', 'Supporting'].includes(roleTier(c));
// "Known for" score: how big the part was times how well known the title is (log of TMDB's vote count,
// which tracks lasting reach better than popularity, which is what's trending this week).
// TV weight grows with episodes and tops out at 10, so a long soap doesn't outrank a famous show.
export function knownScore(c) {
  const weight = c.type === 'tv' ? Math.min(1, (c.episodes || 0) / 10)
    : typeof c.order !== 'number' ? 0.25 : c.order <= 2 ? 1 : c.order <= 7 ? 0.6 : 0.25;
  return weight * Math.log10(1 + (c.voteCount || 0));
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
export { regionName, langName } from './sources.js';
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
// Main key art: backdrops with no text on them (iso_639_1 null), best voted first, at most 6.
// TMDB doesn't tie backdrops to seasons, so these are the safest bet against spoilers, not a guarantee.
export function getBackdrops(t) {
  return cached(`backdrops:${t.type}:${t.id}`, async () => {
    const d = await tmdb(`/${t.type}/${t.id}/images`, { include_image_language: 'null' });
    return (d.backdrops || []).filter((b) => !b.iso_639_1 && b.file_path)
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0))
      .slice(0, 6).map((b) => ({ path: b.file_path }));
  });
}
// Where a title is streaming, free, for rent or for sale in one country (TMDB's data, from JustWatch).
// TMDB answers for every country at once; only the one asked for is kept. Cached for a day, since catalogs change.
export function getWatchProviders(t, region) {
  return cached(`watch:${region}:${t.type}:${t.id}`, async () => {
    const d = await tmdb(`/${t.type}/${t.id}/watch/providers`);
    const r = (d.results || {})[region] || {};
    const slim = (list) => (list || []).map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path, order: p.display_priority ?? 999 }));
    return { link: r.link || '', flatrate: slim(r.flatrate), free: slim(r.free), ads: slim(r.ads), rent: slim(r.rent), buy: slim(r.buy) };
  }, 864e5);
}
// One still per episode of a season (what TMDB shows as the episode's picture). Only episode numbers are kept, no titles.
export function getSeasonStills(t, n) {
  return cached(`stills:${t.id}:${n}`, async () => {
    const d = await tmdb(`/tv/${t.id}/season/${n}`);
    return (d.episodes || []).filter((e) => e.still_path).map((e) => ({ ep: e.episode_number, path: e.still_path }));
  });
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
