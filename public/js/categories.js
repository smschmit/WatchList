// Browse categories (one per column), filtering and sorting.
import { norm } from './util.js';
import { state } from './state.js';
import { FACT_ORDER } from './facts.js';
import { isMovie, totalHours, fieldOf } from './shows.js';
import { FICTION, TONE, ERA_ORDER, builtInWithin } from './sources.js';

// ---------- Categories (one per column you can browse by) ----------
export const STATUS_ORDER = ['Watching', 'Rewatching', 'Want to Watch', "Waiting on Release and Now It's Ready", 'Restart Planned', 'Paused',
  'Paused Between Seasons', 'Waiting for Series End', 'Identified', 'Recommended', 'Finished', 'Dropped', 'Some'];
export const WANT_ORDER = ['A lot', 'Yes', "Once it's finished", 'Maybe'];

// Status options: names, colors and order are editable (#/statuses) and saved in state.statusSettings.list.
// Until edited, the list is STATUS_ORDER with the colors the app always used.
export const STATUS_COLORS = { blue: 'Blue', green: 'Green', teal: 'Teal', purple: 'Purple', pink: 'Pink', red: 'Red',
  orange: 'Orange', yellow: 'Yellow', brown: 'Brown', gray: 'Gray', none: 'No color' };
export function defaultStatusColor(v) {
  if (/^(re)?watching/i.test(v)) return 'green';
  if (/^want/i.test(v)) return 'blue';
  if (/finished/i.test(v)) return 'gray';
  if (/recommended/i.test(v)) return 'purple';
  if (/paused|waiting|restart/i.test(v)) return 'orange';
  if (/dropped/i.test(v)) return 'red';
  return 'none';
}
// Every status: the saved list in order, then any status a show has that isn't in it.
export function statusList() {
  const saved = state.statusSettings && Array.isArray(state.statusSettings.list) ? state.statusSettings.list : null;
  const list = (saved || STATUS_ORDER.map((name) => ({ name, color: defaultStatusColor(name) })))
    .filter((x) => x && x.name).map((x) => ({ name: x.name, color: STATUS_COLORS[x.color] ? x.color : 'none' }));
  const have = new Set(list.map((x) => x.name));
  for (const sh of state.shows) if (sh.status && !have.has(sh.status)) { have.add(sh.status); list.push({ name: sh.status, color: defaultStatusColor(sh.status) }); }
  return list;
}
export const statusNames = () => statusList().map((x) => x.name);
export let statusColors = new Map(); // status name -> color key, rebuilt on render
export function rebuildStatusColors() { statusColors = new Map(statusList().map((x) => [x.name, x.color])); }
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
// Places roll up for browsing: a show set in Brooklyn also counts under New York City and US.
// state.places holds what Wikidata said each place is in (saved by a fill); big cities and regions are built in.
export function placeWithin(name) {
  const p = state.places && state.places[name];
  return (p && p.within) || builtInWithin(name);
}
export function settingValues(s) {
  const out = [];
  for (const n of fieldOf(s, 'setting')) for (const v of [n, ...placeWithin(n)]) if (!out.includes(v)) out.push(v);
  return out;
}
export const CATS = [
  { key: 'status', label: 'My status', get: (s) => s.status, get order() { return statusNames(); } },
  { key: 'rating', label: 'My rating', get: (s) => (s.rating ? stars(s.rating) : ''), order: [5, 4, 3, 2, 1].map(stars) },
  { key: 'want', label: 'Want to watch?', get: (s) => s.want, order: WANT_ORDER, hideBlank: true },
  { key: 'recommend', label: 'Use to recommend similar', get: (s) => s.recommend, order: ['Top 50', 'Yes'], hideBlank: true },
  { key: 'actor', label: 'Favorite actors', get: favNamesFor, multi: true, hideBlank: true },
  { key: 'format', label: 'Format', get: (s) => s.format },
  { key: 'genre', label: 'Genre', get: (s) => s.genres, multi: true },
  { key: 'tag', label: 'Tags', get: (s) => s.tags, multi: true, top: 40 },
  { key: 'network', label: 'Network / platform', get: (s) => s.network, top: 30 },
  { key: 'country', label: 'Country', get: (s) => s.country.split(/\s*,\s*/), multi: true },
  { key: 'language', label: 'Language', get: (s) => s.languages, multi: true },
  { key: 'fiction', label: 'Fiction', get: (s) => fieldOf(s, 'fiction'), order: FICTION },
  { key: 'tone', label: 'Tone', get: (s) => fieldOf(s, 'tone'), order: TONE },
  { key: 'era', label: 'Era (when it is set)', get: (s) => fieldOf(s, 'era'), multi: true, order: ERA_ORDER },
  { key: 'setting', label: 'Setting', get: settingValues, multi: true, top: 40 },
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
export function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
// Release-year range filters: ?yfrom=2010&yto=2019 (either end optional).
export const RANGE = { yfrom: 'From', yto: 'To' };
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
  let yfrom = null;
  let yto = null;
  for (const f of filters) {
    if (f.cat === 'yfrom') { yfrom = Number(f.value); continue; }
    if (f.cat === 'yto') { yto = Number(f.value); continue; }
    const m = f.not ? exc : inc; if (!m.has(f.cat)) m.set(f.cat, new Set()); m.get(f.cat).add(f.value);
  }
  const nq = norm(q);
  return shows.filter((s) => {
    if ((yfrom != null || yto != null) && (!s.year || (yfrom != null && s.year < yfrom) || (yto != null && s.year > yto))) return false;
    for (const [ck, vals] of inc) if (!valuesOf(catByKey[ck], s).some((v) => vals.has(v))) return false;
    for (const [ck, vals] of exc) if (valuesOf(catByKey[ck], s).some((v) => vals.has(v))) return false;
    if (nq && !norm(searchText(s)).includes(nq)) return false;
    return true;
  });
}
// Every text value on a show (including fields added later and favorite actors), for the search bar.
const SEARCH_SKIP = new Set(['id', 'poster', 'profile', 'type']);
export function searchText(s) {
  const out = [];
  const walk = (v, k) => {
    if (v == null || SEARCH_SKIP.has(k)) return;
    if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk);
    else out.push(String(v));
  };
  walk(s);
  out.push(...favNamesFor(s));
  return out.join(' ');
}
