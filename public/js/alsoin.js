// "Also in" on a cast list: for each actor, the other titles of theirs you've seen (or that are famous).
// Needs each actor's combined credits, one TMDB call per actor, so they load only once the cast is on screen,
// a few at a time, and a compact copy is kept on this device in its own key so it can't crowd out the TMDB cache.
import { el, storeSet } from './util.js';
import { listShowFor } from './state.js';
import { seenStatusNames } from './categories.js';
import { tmdb, memCache, SKIP_GENRES, isMajorRole } from './tmdb.js';

const STORE_KEY = 'watchlist:alsoin';
const STORE_MAX_CHARS = 300_000;
const MAX_AGE = 14 * 864e5;
const PARALLEL = 4;
const SHOWN = 3; // seen titles per actor before "+N more"
const FAMOUS_SHOWN = 2; // famous ones you haven't seen

// "Famous": lots of TMDB votes (a stand-in for "I'd have heard of it") and a real part in it.
// TV gets a lower bar because TV titles get far fewer votes than movies.
const FAMOUS_VOTES = { movie: 5000, tv: 600 }; // 600 lets in older classics like The West Wing
const FAMOUS_TV_EPISODES = 4;
const isFamous = (c) => (c.voteCount || 0) >= FAMOUS_VOTES[c.type] && !c.uncredited
  && (c.type === 'tv' ? c.episodes >= FAMOUS_TV_EPISODES : isMajorRole(c));

export const ALSO_FILTERS = [
  ['seen-famous', 'Seen or famous'],
  ['seen', 'Seen'],
  ['list', 'On my list'],
  ['off', 'Off'],
];
const FILTER_KEY = 'watchlist:alsoin-filter';
function loadFilter() {
  try { const v = localStorage.getItem(FILTER_KEY); return ALSO_FILTERS.some(([k]) => k === v) ? v : 'seen-famous'; } catch { return 'seen-famous'; }
}
function saveFilter(v) { try { localStorage.setItem(FILTER_KEY, v); } catch {} }

// ---------- Credits, compact ----------
// Each credit: [type, id, episodes, order, votes, year, title]. Title is kept only for famous ones,
// since titles on your list come from the list itself.
let store = null;
function readStore() {
  if (store) return store;
  try { store = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { store = {}; }
  return store;
}
function writeStore() {
  const all = readStore();
  let json = JSON.stringify(all);
  if (json.length > STORE_MAX_CHARS) {
    const keys = Object.keys(all).sort((a, b) => all[a].t - all[b].t);
    let total = json.length;
    for (const k of keys) { if (total <= STORE_MAX_CHARS * 0.8) break; total -= JSON.stringify(all[k]).length; delete all[k]; }
    json = JSON.stringify(all);
  }
  storeSet(STORE_KEY, json, [STORE_KEY]);
}
const expand = ([type, id, episodes, order, voteCount, year, title]) =>
  ({ type: type ? 'tv' : 'movie', id, episodes, order, voteCount, year, title });
function compact(credits) {
  return credits.filter((c) => !c.appearance).map((c) => [c.type === 'tv' ? 1 : 0, c.id, c.episodes || 0,
    typeof c.order === 'number' ? c.order : null, c.voteCount || 0, c.year || null, isFamous(c) ? c.title : '']);
}

const inflight = new Map();
export function creditsFor(pid) {
  const hit = readStore()[pid];
  if (hit && Date.now() - hit.t < MAX_AGE) return Promise.resolve(hit.c.map(expand));
  // An actor page opened this session already has the full credits.
  const full = memCache.get(`person3:${pid}`);
  if (full) return Promise.resolve(remember(pid, compact(full.v.credits)));
  if (inflight.has(pid)) return inflight.get(pid);
  const job = tmdb(`/person/${pid}/combined_credits`).then((d) => {
    const seen = new Map();
    for (const x of d.cast || []) {
      if (x.media_type !== 'tv' && x.media_type !== 'movie') continue;
      const k = `${x.media_type}:${x.id}`;
      const date = x.first_air_date || x.release_date || '';
      const item = seen.get(k) || { type: x.media_type, id: x.id, title: x.name || x.title, year: date ? Number(date.slice(0, 4)) : null,
        voteCount: x.vote_count || 0, episodes: 0, order: null,
        appearance: SKIP_GENRES.some((g) => (x.genre_ids || []).includes(g)) || /\b(self|himself|herself|themselves)\b/i.test(x.character || '') };
      item.episodes += x.episode_count || 0;
      item.uncredited = /uncredited/i.test(x.character || '');
      if (typeof x.order === 'number' && (item.order === null || x.order < item.order)) item.order = x.order;
      seen.set(k, item);
    }
    return remember(pid, compact([...seen.values()]));
  }).finally(() => inflight.delete(pid));
  inflight.set(pid, job);
  return job;
}
function remember(pid, c) {
  readStore()[pid] = { t: Date.now(), c };
  clearTimeout(remember.timer);
  remember.timer = setTimeout(writeStore, 500); // one write after a batch, not one per actor
  return c.map(expand);
}

// ---------- Picking what to show ----------
// Seen titles first (newest first), then famous ones not on your list (best known first).
function pick(credits, filter, skip) {
  const seen = new Set(seenStatusNames());
  const mine = [], famous = [];
  for (const c of credits) {
    if (c.type === skip.type && c.id === skip.id) continue;
    const s = listShowFor(c);
    if (s && (filter === 'list' || seen.has(s.status))) mine.push({ c, s, seen: seen.has(s.status) });
    else if (filter === 'seen-famous' && c.title) famous.push({ c, s, seen: false });
  }
  mine.sort((a, b) => (b.seen - a.seen) || (b.c.year || 0) - (a.c.year || 0));
  famous.sort((a, b) => b.c.voteCount - a.c.voteCount);
  return { mine, famous };
}
const stop = (e) => e.stopPropagation(); // the tile itself opens the actor page
function links(items) {
  return items.flatMap(({ c, s, seen }, i) => {
    const href = s ? `#/show/${encodeURIComponent(s.id)}` : `#/title/${c.type}-${c.id}`;
    return [i ? ', ' : '', el('a', { href, class: seen ? 'also-seen' : 'also-other', title: s ? (s.status || 'On your list') : 'Not on your list', onclick: stop },
      s ? s.title : c.title)];
  });
}
// Two lines: what you've seen (or, with "On my list", everything on your list, seen ones in bold),
// then a smaller grey line of up to 2 famous titles you haven't seen. "+N more" opens the actor page.
function alsoLines(pid, credits, filter, skip) {
  const { mine, famous } = pick(credits, filter, skip);
  if (!mine.length && !famous.length) return null;
  const more = (n) => (n > 0 ? el('a', { href: `#/actor/${pid}`, class: 'also-more', onclick: stop }, ` +${n} more`) : null);
  const box = el('div', { class: 'also-in' });
  if (mine.length) box.append(el('div', { class: 'small also-mine' },
    filter === 'list' ? 'On your list: ' : el('span', { class: 'also-check', 'aria-label': 'Seen' }, '✓ Seen: '),
    ...links(mine.slice(0, SHOWN)), more(mine.length - SHOWN)));
  if (famous.length) box.append(el('div', { class: 'also-famous' }, 'Also in ', ...links(famous.slice(0, FAMOUS_SHOWN)),
    more(mine.length ? 0 : famous.length - FAMOUS_SHOWN)));
  return box;
}

// ---------- On the cast list ----------
// tiles: [{ person, tile }] in billing order. t: the title the cast belongs to, left out of each line.
// Returns the filter control to put above the grid.
export function wireAlsoIn(section, tiles, t) {
  let filter = loadFilter();
  const lines = new Map(); // pid -> credits once loaded
  const draw = (pid) => {
    const entry = tiles.find((x) => x.person.id === pid);
    if (!entry) return;
    const old = entry.tile.querySelector('.also-in');
    const line = filter === 'off' || !lines.has(pid) ? null : alsoLines(pid, lines.get(pid), filter, t);
    if (old) old.remove();
    if (line) entry.tile.querySelector('.person-body').append(line);
  };
  let started = false;
  const start = () => {
    if (started || filter === 'off') return;
    started = true;
    const queue = tiles.map((x) => x.person.id);
    const worker = async () => {
      while (queue.length) {
        const pid = queue.shift();
        try { lines.set(pid, await creditsFor(pid)); draw(pid); } catch { /* one actor failing shouldn't stop the rest */ }
      }
    };
    for (let i = 0; i < PARALLEL; i++) worker();
  };
  const select = el('select', { 'aria-label': 'Also in', onchange: (e) => {
    filter = e.target.value; saveFilter(filter);
    for (const { person } of tiles) draw(person.id);
    start();
  } }, ALSO_FILTERS.map(([v, label]) => el('option', { value: v, selected: v === filter }, label)));
  // Wait until the cast is (nearly) on screen so opening a show doesn't fire 40 lookups you may never look at.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '300px' });
    io.observe(section);
  } else start();
  return el('label', { class: 'also-filter small muted' }, 'Also in: ', select);
}
