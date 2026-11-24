// Browse categories (one per column), filtering and sorting.
import { norm } from './util.js';
import { state } from './state.js';
import { FACT_ORDER } from './facts.js';
import { isMovie, totalHours } from './shows.js';

// ---------- Categories (one per column you can browse by) ----------
export const STATUS_ORDER = ['Watching', 'Rewatching', 'Want to Watch', "Waiting on Release and Now It's Ready", 'Restart Planned', 'Paused',
  'Paused Between Seasons', 'Waiting for Series End', 'Identified', 'Recommended', 'Finished', 'Dropped', 'Some'];
export const WANT_ORDER = ['A lot', 'Yes', "Once it's finished", 'Maybe'];
export function bucket(v, edges) {
  if (v == null) return '';
  for (const [max, label] of edges) if (v < max) return label;
  return edges[edges.length - 1][1];
}
export const LEN_EDGES = [[26, 'Under 26 min'], [36, '26–35 min'], [50, '36–49 min'], [70, '50–69 min'], [Infinity, '70 min +']];
export const MOVIE_EDGES = [[90, 'Movie under 90 min'], [120, 'Movie 90–119 min'], [Infinity, 'Movie 2 h +']];
export const HOUR_EDGES = [[3, 'Under 3 h'], [10, '3–10 h'], [25, '10–25 h'], [50, '25–50 h'], [100, '50–100 h'], [Infinity, '100 h +']];
export const SEASON_EDGES = [[2, '1 season'], [4, '2–3 seasons'], [7, '4–6 seasons'], [Infinity, '7+ seasons']];
export let actorIndex = new Map(); // "tv:123" -> [actor names], rebuilt on render
export function rebuildActorIndex() {
  actorIndex = new Map();
  for (const a of state.actors) for (const c of a.credits) {
    const k = `${c.type}:${c.id}`;
    if (!actorIndex.has(k)) actorIndex.set(k, []);
    if (!actorIndex.get(k).includes(a.name)) actorIndex.get(k).push(a.name);
  }
}
export function favNamesFor(s) { return s.tmdb && s.tmdb.id ? actorIndex.get(`${s.tmdb.type}:${s.tmdb.id}`) || [] : []; }
export const CATS = [
  { key: 'status', label: 'My status', get: (s) => s.status, order: STATUS_ORDER },
  { key: 'want', label: 'Want to watch?', get: (s) => s.want, order: WANT_ORDER, hideBlank: true },
  { key: 'recommend', label: 'Use to recommend similar', get: (s) => s.recommend, order: ['Top 50', 'Yes'], hideBlank: true },
  { key: 'actor', label: 'Favorite actors', get: favNamesFor, multi: true, hideBlank: true },
  { key: 'format', label: 'Format', get: (s) => s.format },
  { key: 'genre', label: 'Genre', get: (s) => s.genres, multi: true },
  { key: 'tag', label: 'Tags', get: (s) => s.tags, multi: true, top: 40 },
  { key: 'network', label: 'Network / platform', get: (s) => s.network, top: 30 },
  { key: 'country', label: 'Country', get: (s) => s.country.split(/\s*,\s*/), multi: true },
  { key: 'language', label: 'Language', get: (s) => s.languages, multi: true },
  { key: 'decade', label: 'Decade', get: (s) => (s.year ? `${Math.floor(s.year / 10) * 10}s` : ''), sortByValue: true },
  { key: 'showStatus', label: 'Show status', get: (s) => s.showStatus },
  { key: 'tmdbStatus', label: 'Show status on TMDB (last check)', get: (s) => (s.facts ? s.facts.status : ''), order: FACT_ORDER, hideBlank: true },
  { key: 'structure', label: 'Structure', get: (s) => s.structure },
  { key: 'length', label: 'Episode length', get: (s) => (isMovie(s) ? bucket(s.epLength, MOVIE_EDGES) : bucket(s.epLength, LEN_EDGES)),
    order: [...LEN_EDGES, ...MOVIE_EDGES].map((e) => e[1]) },
  { key: 'time', label: 'Total time to watch', get: (s) => bucket(totalHours(s), HOUR_EDGES), order: HOUR_EDGES.map((e) => e[1]) },
  { key: 'seasons', label: 'Seasons', get: (s) => (isMovie(s) ? '' : bucket(s.seasons, SEASON_EDGES)), order: SEASON_EDGES.map((e) => e[1]), hideBlank: true },
  { key: 'source', label: 'Source', get: (s) => s.sources, multi: true },
  { key: 'confidence', label: 'Research confidence', get: (s) => s.confidence, order: ['High', 'Medium', 'Low', 'Check'] },
];
export const catByKey = Object.fromEntries(CATS.map((c) => [c.key, c]));
export const BLANK = '(not set)';
export function valuesOf(cat, s) {
  const v = cat.get(s);
  const list = (Array.isArray(v) ? v : [v]).filter((x) => x !== '' && x != null);
  return list.length ? list : [BLANK];
}
export function counts(cat, shows) {
  const m = new Map();
  for (const s of shows) for (const v of valuesOf(cat, s)) m.set(v, (m.get(v) || 0) + 1);
  if (cat.hideBlank) m.delete(BLANK);
  const entries = [...m.entries()];
  const rank = (v) => { const i = (cat.order || []).indexOf(v); return i < 0 ? 999 : i; };
  entries.sort((a, b) => {
    if (a[0] === BLANK) return 1; if (b[0] === BLANK) return -1;
    if (cat.order) return rank(a[0]) - rank(b[0]) || b[1] - a[1];
    if (cat.sortByValue) return a[0].localeCompare(b[0]);
    return b[1] - a[1] || a[0].localeCompare(b[0]);
  });
  return entries;
}

// ---------- List ----------
export const SORTS = {
  title: ['Title', (a, b) => norm(a.title).localeCompare(norm(b.title))],
  newest: ['Newest', (a, b) => (b.year || 0) - (a.year || 0)],
  oldest: ['Oldest', (a, b) => (a.year || 9999) - (b.year || 9999)],
  shortest: ['Least time', (a, b) => (totalHours(a) ?? 1e9) - (totalHours(b) ?? 1e9)],
  longest: ['Most time', (a, b) => (totalHours(b) ?? -1) - (totalHours(a) ?? -1)],
  eplen: ['Shortest episodes', (a, b) => (a.epLength ?? 1e9) - (b.epLength ?? 1e9)],
  seasons: ['Fewest seasons', (a, b) => (a.seasons ?? 1e9) - (b.seasons ?? 1e9)],
};
export function applyFilters(shows, filters, q) {
  // Same column: included values widen (OR). Excluded values drop any show that has one. Different columns narrow (AND).
  const inc = new Map();
  const exc = new Map();
  for (const f of filters) { const m = f.not ? exc : inc; if (!m.has(f.cat)) m.set(f.cat, new Set()); m.get(f.cat).add(f.value); }
  const nq = norm(q);
  return shows.filter((s) => {
    for (const [ck, vals] of inc) if (!valuesOf(catByKey[ck], s).some((v) => vals.has(v))) return false;
    for (const [ck, vals] of exc) if (valuesOf(catByKey[ck], s).some((v) => vals.has(v))) return false;
    if (nq && !norm(`${s.title} ${s.notes}`).includes(nq)) return false;
    return true;
  });
}
