// One actor's page, and the favorite actors page.
import { el, toast, today, norm } from '../util.js';
import { state, readOnly, save, canEdit, actorByTmdb, listShowFor } from '../state.js';
import { favNamesFor, statusNames, seenStatusNames } from '../categories.js';
import { go, listHash, recall, remember, restoreScroll, syncLastHash } from '../router.js';
import { getPerson, roleTier, knownScore, searchPeoplePage } from '../tmdb.js';
import { addFromTmdb, addAsFinished, removeShow, slimCredits, noteNewCredits } from '../library.js';
import { recordView } from '../recent.js';
import { pinTitle } from '../pagetitle.js';
import { statusSelect, poster, heartBtn, titleHash, cardClick, favLine, pagedSearch } from '../ui.js';

// ---------- Filmography filters ----------
// Chips in a group combine with OR (Lead or Supporting); groups combine with AND (and a Drama, and from the 1990s).
// Talk shows and appearances as themself are hidden unless switched on.
const ROLES = ['Lead', 'Supporting', 'Recurring', 'Small role', 'Guest', 'Unknown'];
const MAJOR = ['Lead', 'Supporting', 'Recurring']; // same as isMajorRole
const GROUPS = [
  { key: 'type', label: 'Type', values: (c) => [c.type === 'tv' ? 'TV' : 'Movie'], order: () => ['TV', 'Movie'] },
  { key: 'role', label: 'Role', values: (c) => [roleTier(c) || 'Unknown'], order: () => ROLES },
  { key: 'list', label: 'My list', order: () => ['Not on my list', 'On my list', ...statusNames()],
    values: (c) => { const s = listShowFor(c); return s ? ['On my list', ...(s.status ? [s.status] : [])] : ['Not on my list']; } },
  { key: 'genre', label: 'Genre', values: (c) => c.genres || [] }, // most common first
  { key: 'decade', label: 'Decade', values: (c) => [c.year ? `${Math.floor(c.year / 10) * 10}s` : 'No year'],
    order: (totals) => [...totals.keys()].filter((v) => v !== 'No year').sort().reverse() },
];
// One-tap presets for the My list group. Seen: see seenStatusNames. Plan to see: the statuses that mean you mean to watch it.
const PLAN = ['Want to Watch', 'Restart Planned', "Waiting on Release and Now It's Ready"];
export function presetStatuses(key) {
  const names = statusNames();
  const want = key === 'seen' ? seenStatusNames() : PLAN;
  return want.filter((n) => names.includes(n));
}
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const blankFilters = () => ({ ...Object.fromEntries(GROUPS.map((g) => [g.key, []])), appearances: false });
function tally(credits, g) {
  const m = new Map();
  for (const c of credits) for (const v of g.values(c)) m.set(v, (m.get(v) || 0) + 1);
  return m;
}
// The group's fixed order first, then anything else by how common it is.
function orderValues(g, totals) {
  const fixed = g.order ? g.order(totals) : [];
  const rest = [...totals.keys()].filter((v) => !fixed.includes(v)).sort((a, b) => totals.get(b) - totals.get(a) || a.localeCompare(b));
  return [...fixed, ...rest];
}
// A rating means little with only a handful of votes, so those sort after the rated ones.
const rated = (c) => (c.voteCount || 0) >= 20 && c.rating > 0;
const SORTS = [
  ['newest', 'Newest', null],
  ['oldest', 'Oldest', (a, b) => (a.year || 9999) - (b.year || 9999)],
  ['known', 'Known for', (a, b) => knownScore(b) - knownScore(a)],
  ['rating', 'Rating', (a, b) => (rated(b) - rated(a)) || (rated(a) ? b.rating - a.rating : (b.voteCount || 0) - (a.voteCount || 0))],
  ['episodes', 'Most episodes', (a, b) => (b.episodes || 0) - (a.episodes || 0)],
  ['title', 'Title A–Z', (a, b) => norm(a.title).localeCompare(norm(b.title))],
];
// What the scroll handle's bubble shows for a credit, matching the sort.
function jumpLabel(c, sort) {
  if (sort === 'newest' || sort === 'oldest') return c.year ? String(c.year) : 'No year';
  if (sort === 'title') { const ch = norm(c.title).charAt(0).toUpperCase(); return /[A-Z]/.test(ch) ? ch : '#'; }
  if (sort === 'episodes') return c.episodes ? `${c.episodes} ep` : 'Movies';
  return '';
}
// "Use as default" is kept on this device only, like other view preferences.
const DEFAULT_KEY = 'watchlist:actor-filters';
function loadDefault() {
  try {
    const d = JSON.parse(localStorage.getItem(DEFAULT_KEY) || 'null');
    if (!d || typeof d !== 'object') return null;
    const filters = blankFilters();
    for (const g of GROUPS) if (Array.isArray(d.filters && d.filters[g.key])) filters[g.key] = d.filters[g.key].map(String);
    filters.appearances = !!(d.filters && d.filters.appearances);
    return { filters, sortBy: SORTS.some(([v]) => v === d.sortBy) ? d.sortBy : 'newest' };
  } catch { return null; }
}
function saveDefault(d) {
  try { if (d) localStorage.setItem(DEFAULT_KEY, JSON.stringify(d)); else localStorage.removeItem(DEFAULT_KEY); } catch { toast('Could not save on this device.'); }
}

// ---------- Actor page ----------
export function viewActor(r) {
  const pid = Number(r.id);
  const fav = actorByTmdb(pid);
  const here = location.hash;
  const wrap = el('div', { class: 'actor-page' });
  const head = el('div', { class: 'show-head' }, poster(fav && fav.profile, 'w342', 'poster big'),
    el('div', { class: 'show-head-body' }, el('h1', {}, fav ? fav.name : 'Loading…')));
  wrap.append(head);
  if (fav) pinTitle(head.querySelector('h1'));
  const body = el('div', {}, el('p', { class: 'muted' }, 'Loading filmography…'));
  wrap.append(body);
  getPerson(pid).then((p) => {
    const a = actorByTmdb(pid);
    if (location.hash === here) recordView({ kind: 'actor', id: pid, name: p.name, profile: p.profile || null });
    if (a && (!a.creditsAt || a.creditsAt < today())) {
      noteNewCredits(a, p.credits);
      a.credits = slimCredits(p.credits);
      a.creditsAt = today(); a.profile = p.profile || a.profile; save({ quiet: true });
    }
    const note = el('textarea', { rows: 2, placeholder: 'Why you like them', readOnly }, a ? a.note : '');
    note.addEventListener('change', () => { if (!canEdit()) return; const x = actorByTmdb(pid); if (x) { x.note = note.value; save({ quiet: true }); } });
    const countLine = el('p', { class: 'muted' });
    const updateCount = () => { countLine.textContent = `${p.known || 'Actor'} · ${p.credits.filter((c) => listShowFor(c)).length} on your list`; };
    updateCount();
    head.replaceChildren(poster(p.profile, 'w342', 'poster big'), el('div', { class: 'show-head-body' },
      el('div', { class: 'row' }, el('h1', {}, p.name), heartBtn({ id: p.id, name: p.name, profile: p.profile }, a)),
      countLine,
      a ? el('label', { class: 'field wide' }, 'Note', note) : null,
      p.bio ? el('details', {}, el('summary', {}, 'Biography'), el('p', { class: 'small' }, p.bio)) : null));
    if (location.hash === here) pinTitle(head.querySelector('h1'));

    // Filters, sort and search are remembered per page so Back brings the list back the same way.
    // A new visit starts from the default saved with "Use as default" (this device only), else from nothing.
    const saved = loadDefault();
    let f = recall('filters', null) || (saved ? saved.filters : blankFilters());
    let sortBy = recall('sortBy', saved ? saved.sortBy : 'newest');
    let find = recall('find', '');
    let open = recall('filtersOpen', matchMedia('(min-width: 641px)').matches);
    const keep = () => remember('filters', JSON.parse(JSON.stringify(f)));
    const listBox = el('div', { class: 'credit-list' });
    const shownLine = el('span', { class: 'muted small filter-count' });
    let findTimer;
    const findInput = el('input', { type: 'search', class: 'find-input', placeholder: 'Find in filmography', 'aria-label': 'Find in filmography',
      autocomplete: 'off', value: find,
      oninput: () => { clearTimeout(findTimer); findTimer = setTimeout(() => { find = findInput.value; remember('find', find); fill(); }, 150); },
      onkeydown: (e) => { if (e.key === 'Escape' && findInput.value) { findInput.value = ''; find = ''; remember('find', ''); fill(); } } });
    const sortSelect = el('select', { 'aria-label': 'Sort filmography', onchange: (e) => { sortBy = e.target.value; remember('sortBy', sortBy); fill(); } },
      SORTS.map(([v, label]) => el('option', { value: v, selected: sortBy === v }, label)));
    const filtersBtn = el('button', { class: 'btn small filters-btn', 'aria-controls': `filters-${pid}`,
      onclick: () => { open = !open; remember('filtersOpen', open); fill(); } });
    const panel = el('div', { class: 'filter-panel card', id: `filters-${pid}` });
    const activeRow = el('div', { class: 'chips active-filters' });
    const presetBox = el('span', { class: 'seg presets', role: 'group', 'aria-label': 'Quick filters' });
    const controls = el('div', { class: 'filter-bar' },
      el('div', { class: 'find-row' }, findInput), presetBox, sortSelect, filtersBtn, shownLine);
    const presetOn = (key) => { const want = presetStatuses(key); return want.length > 0 && sameSet(f.list, want); };
    function drawPresets(ws) {
      presetBox.replaceChildren(...[['seen', 'Seen'], ['plan', 'Plan to see']].map(([key, label]) => {
        const want = presetStatuses(key);
        const on = presetOn(key);
        const n = p.credits.filter((c) => passes(c, ws, 'list') && listShowFor(c) && want.includes(listShowFor(c).status)).length;
        return el('button', { class: `seg-btn ${on ? 'on' : ''}`, 'aria-pressed': String(on), disabled: !want.length,
          title: on ? 'Tap to clear' : `My list: ${want.join(', ')}`,
          onclick: () => change(() => { f.list = on ? [] : [...want]; }) }, label, el('span', { class: 'count' }, ` ${n}`));
      }));
    }
    // Every word typed has to appear in the title, year, character, type or genre (ignoring case and accents).
    const words = () => norm(find).split(/\s+/).filter(Boolean);
    const matches = (c, ws) => { const t = norm(`${c.title} ${c.year || ''} ${c.character || ''} ${c.type === 'tv' ? 'tv' : 'movie'} ${(c.genres || []).join(' ')}`); return ws.every((w) => t.includes(w)); };
    // skip: a group key, 'appearances' or 'find', left out so we can count what it's hiding.
    const passes = (c, ws, skip) => (skip === 'appearances' || f.appearances || !c.appearance)
      && (skip === 'find' || !ws.length || matches(c, ws))
      && GROUPS.every((g) => g.key === skip || !f[g.key].length || g.values(c).some((v) => f[g.key].includes(v)));
    const isMajor = () => f.role.length === MAJOR.length && MAJOR.every((v) => f.role.includes(v));
    // "Major roles" counts as one filter, matching the single chip it shows as.
    const activeCount = () => GROUPS.reduce((n, g) => n + (g.key === 'role' && isMajor() ? 1 : f[g.key].length), 0) + (f.appearances ? 1 : 0);
    const change = (fn) => { fn(); keep(); fill(); };

    function chip(label, n, on, onclick, key, extra = '') {
      return el('button', { class: `chip pick-${on ? 'inc' : 'off'} ${!on && !n ? 'zero' : ''} ${extra}`, 'aria-pressed': on ? 'true' : 'false',
        'data-key': key, onclick }, on ? el('span', { class: 'mark' }, '✓') : null, label, n != null ? el('span', { class: 'count' }, n) : null);
    }
    function buildPanel(ws, shown) {
      const rows = [];
      const pool = p.credits.filter((c) => f.appearances || !c.appearance);
      for (const g of GROUPS) {
        const totals = tally(pool, g);
        const sel = f[g.key];
        const values = orderValues(g, totals).filter((v) => totals.get(v) || sel.includes(v));
        if (values.length < 2 && !sel.length) continue; // one choice isn't a filter
        // Within a group choices combine with OR, so count against everything else's filters but not this group's.
        const counts = tally(p.credits.filter((c) => passes(c, ws, g.key)), g);
        const chips = values.map((v) => chip(v, counts.get(v) || 0, sel.includes(v),
          () => change(() => { f[g.key] = sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]; }), `${g.key}:${v}`));
        if (g.key === 'role') {
          const major = isMajor();
          const n = p.credits.filter((c) => passes(c, ws, 'role') && MAJOR.includes(g.values(c)[0])).length;
          chips.unshift(chip('Major roles', n, major, () => change(() => { f.role = major ? [] : [...MAJOR]; }), 'role:*major', 'shortcut'));
        }
        rows.push(el('div', { class: 'filter-group' }, el('span', { class: 'filter-label' }, g.label), el('div', { class: 'chips' }, chips)));
      }
      const extras = p.credits.filter((c) => c.appearance && passes(c, ws, 'appearances')).length;
      if (extras || f.appearances) rows.push(el('div', { class: 'filter-group' }, el('span', { class: 'filter-label' }, 'Also show'),
        el('div', { class: 'chips' }, chip('Talk shows & appearances as themself', extras, f.appearances,
          () => change(() => { f.appearances = !f.appearances; }), 'appearances'))));
      const def = loadDefault();
      const isDefault = def && JSON.stringify(def.filters) === JSON.stringify(f) && def.sortBy === sortBy;
      rows.push(el('div', { class: 'row filter-actions' },
        el('span', { class: 'muted small' }, isDefault ? 'This is your default for actor pages.' : 'Tap to pick; pick several in a row to combine them.'),
        el('span', { class: 'spacer' }),
        activeCount() ? el('button', { class: 'btn small ghost', onclick: () => change(() => { f = blankFilters(); }) }, 'Clear all') : null,
        def && isDefault ? el('button', { class: 'btn small ghost', onclick: () => { saveDefault(null); toast('Default cleared. Actor pages start unfiltered.'); fill(); } }, 'Forget default') : null,
        isDefault ? null : el('button', { class: 'btn small', title: 'Start every actor page with these filters and this sort (on this device)',
          onclick: () => { saveDefault({ filters: f, sortBy }); toast('Saved. Actor pages on this device will start this way.'); fill(); } }, 'Use as default'),
        // On a phone the panel can fill the screen, so offer a way straight to the results.
        el('button', { class: 'btn small primary phone-only', onclick: () => { open = false; remember('filtersOpen', false); fill(); const bar = document.querySelector('.topbar');
          window.scrollTo(0, controls.getBoundingClientRect().top + scrollY - (bar ? bar.getBoundingClientRect().bottom : 0) - 8); } },
          `Show ${shown}`)));
      return rows;
    }
    function buildActive() {
      const out = [];
      const major = isMajor();
      for (const g of GROUPS) {
        const vals = g.key === 'role' && major ? ['Major roles'] : f[g.key];
        for (const v of vals) out.push(el('button', { class: 'chip active', title: 'Remove filter',
          onclick: () => change(() => { f[g.key] = v === 'Major roles' ? [] : f[g.key].filter((x) => x !== v); }) },
          el('span', { class: 'chip-cat' }, `${g.label}:`), v, el('span', { class: 'x' }, '×')));
      }
      if (f.appearances) out.push(el('button', { class: 'chip active', title: 'Remove filter', onclick: () => change(() => { f.appearances = false; }) },
        'With appearances as themself', el('span', { class: 'x' }, '×')));
      if (out.length) out.push(el('button', { class: 'btn small ghost', onclick: () => change(() => { f = blankFilters(); }) }, 'Clear all'));
      return out;
    }
    function fill() {
      const ws = words();
      drawPresets(ws);
      const focusKey = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.key;
      const items = p.credits.filter((c) => passes(c, ws));
      const sorter = SORTS.find(([v]) => v === sortBy);
      if (sorter && sorter[2]) items.sort(sorter[2]); // credits arrive newest first; sorts are stable, so ties keep that order
      listBox.replaceChildren(...items.map((c) => { const row = creditRow(c); row.dataset.jump = jumpLabel(c, sortBy); return row; }));
      const total = p.credits.filter((c) => f.appearances || !c.appearance).length;
      shownLine.textContent = items.length === total ? `${total} titles` : `Showing ${items.length} of ${total}`;
      const n = activeCount();
      filtersBtn.replaceChildren(...['Filters', n ? el('span', { class: 'badge' }, n) : null, el('span', { 'aria-hidden': 'true' }, open ? ' ▴' : ' ▾')].filter(Boolean));
      filtersBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      filtersBtn.classList.toggle('active', !!n);
      panel.hidden = !open;
      if (open) panel.replaceChildren(...buildPanel(ws, items.length));
      activeRow.replaceChildren(...(open ? [] : buildActive()));
      activeRow.hidden = !activeRow.childElementCount;
      if (focusKey) { const b = panel.querySelector(`[data-key="${CSS.escape(focusKey)}"]`); if (b) b.focus(); }
      if (!items.length) {
        // Say what's hiding things, and offer the change that brings back the most.
        const fixes = [];
        const add = (label, skip, run) => { const k = p.credits.filter((c) => passes(c, ws, skip)).length; if (k) fixes.push({ label, k, run }); };
        for (const g of GROUPS) if (f[g.key].length) add(`Clear ${g.label.toLowerCase()}`, g.key, () => { f[g.key] = []; });
        if (!f.appearances) add('Include appearances as themself', 'appearances', () => { f.appearances = true; });
        if (ws.length) add('Clear the search', 'find', () => { findInput.value = ''; find = ''; remember('find', ''); });
        fixes.sort((a, b) => b.k - a.k);
        listBox.append(el('p', { class: 'muted' }, ws.length ? `No matches for “${find.trim()}”` : 'Nothing matches these filters', fixes.length ? '. ' : '.',
          ...fixes.slice(0, 2).map((x) => el('button', { class: 'btn small', onclick: () => change(x.run) }, `${x.label} (${x.k})`))));
      }
    }
    function creditRow(c) {
      const mine = listShowFor(c);
      const addWith = (fn) => async (e) => {
        e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        const btns = e.currentTarget.parentNode;
        const s = await fn({ id: c.id, type: c.type }, { sources: [`Actor: ${p.name}`] });
        if (s) {
          toast(`Added ${s.title} as ${s.status}`, { label: 'Undo', run: () => { removeShow(s); fill(); updateCount(); } });
          fill(); updateCount();
        } else btns.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      };
      const action = mine
        ? statusSelect(mine)
        : readOnly ? null : el('div', { class: 'credit-actions' },
          el('button', { class: 'btn small primary', title: 'Add to your list', onclick: addWith(addFromTmdb) }, el('span', { class: 'wide-only' }, '+ Add'), el('span', { class: 'narrow-only', 'aria-hidden': 'true' }, '+')),
          el('button', { class: 'btn small', title: 'Seen it: add as Finished', onclick: addWith(addAsFinished) }, el('span', { class: 'wide-only' }, '✓ Seen it'), el('span', { class: 'narrow-only', 'aria-hidden': 'true' }, '✓')));
      const href = titleHash(c, `Actor: ${p.name}`);
      return el('div', { class: `credit clickable ${mine ? 'mine' : ''}`, onclick: cardClick(href) }, el('a', { href, 'aria-hidden': 'true', tabindex: '-1' }, poster(c.poster)),
        el('div', { class: 'credit-body' },
          el('div', {}, el('a', { class: 'credit-title', href }, el('b', {}, c.title)), ` ${c.year || ''} · ${c.type === 'tv' ? 'TV' : 'Movie'}`),
          el('div', { class: 'muted small' }, roleTier(c) ? el('span', { class: `role-tag role-${roleTier(c) === 'Guest' || roleTier(c) === 'Small role' ? 'minor' : 'major'}` }, roleTier(c)) : null,
            [c.character, c.episodes ? `${c.episodes} ep` : '', sortBy === 'rating' && rated(c) ? `★ ${c.rating.toFixed(1)}` : ''].filter(Boolean).join(' · ')),
          favLine(c, { skip: p.name })),
        action);
    }
    body.replaceChildren(el('h2', {}, 'Filmography'), controls, panel, activeRow, listBox);
    fill();
    restoreScroll();
  }).catch((e) => body.replaceChildren(el('p', { class: 'muted' }, e.message)));
  return wrap;
}

// Favorite actors, with a search box: typing filters your favorites at once and searches TMDB for other actors
// underneath. The search is kept in the URL (#/actors?q=…) so Back returns to the results.
export function viewActors(r) {
  const q0 = (r && r.params.get('q')) || '';
  const wrap = el('div', { class: 'actors-page' }, el('h1', {}, 'Actors'));
  const input = el('input', { type: 'search', class: 'find-input', placeholder: 'Search actors', 'aria-label': 'Search actors', autocomplete: 'off', value: q0 });
  const favBox = el('div');
  const tmdbHead = el('h2', { hidden: true }, 'On TMDB');
  const results = el('div', { class: 'cast-grid' });
  const more = el('button', { class: 'btn small', type: 'button', hidden: true }, 'Show more');
  const favIds = () => new Set(state.actors.map((a) => a.tmdbId));
  const onList = new Set(state.shows.filter((s) => s.tmdb && s.tmdb.id).map((s) => `${s.tmdb.type}:${s.tmdb.id}`));
  const { run } = pagedSearch({ results, more, empty: 'No other actors found.',
    fetchPage: (p) => ({ q: input.value.trim(), p }),
    load: ({ q, p }) => searchPeoplePage(q, p),
    renderItem: (h) => (favIds().has(h.id) ? null : personResult(h, onList)) });
  function drawFavs() {
    const words = norm(input.value).split(/\s+/).filter(Boolean);
    const actors = [...state.actors].sort((a, b) => a.name.localeCompare(b.name)).filter((a) => words.every((w) => norm(a.name).includes(w)));
    if (!state.actors.length) {
      favBox.replaceChildren(el('p', { class: 'muted' }, 'No favorites yet. Search for an actor above, or open a show, look at its cast, and tap ♡ on the actors you like.'));
      return;
    }
    favBox.replaceChildren(el('h2', {}, `Favorites${words.length ? ` matching “${input.value.trim()}”` : ''} (${actors.length})`),
      actors.length ? el('div', { class: 'cast-grid' }, actors.map(favTile)) : el('p', { class: 'muted small' }, 'No favorites match.'));
  }
  let timer;
  const update = (now) => {
    drawFavs();
    const q = input.value.trim();
    history.replaceState(history.state, '', q ? `#/actors?${new URLSearchParams({ q })}` : '#/actors');
    syncLastHash();
    clearTimeout(timer);
    tmdbHead.hidden = q.length < 2;
    if (q.length < 2) { run(); return; } // clears
    timer = setTimeout(() => run(), now ? 0 : 350);
  };
  input.addEventListener('input', () => update(false));
  wrap.append(el('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); update(true); } }, input),
    favBox, tmdbHead, results, el('div', { class: 'more-row' }, more));
  drawFavs();
  if (q0.trim().length >= 2) { tmdbHead.hidden = false; run(); }
  return wrap;
}
function favTile(a) {
  const n = state.shows.filter((s) => favNamesFor(s).includes(a.name)).length;
  return el('div', { class: 'person clickable', onclick: cardClick(`#/actor/${a.tmdbId}`) },
    el('a', { href: `#/actor/${a.tmdbId}` }, poster(a.profile, 'w185', 'face')),
    el('div', { class: 'person-body' }, el('a', { class: 'person-name', href: `#/actor/${a.tmdbId}` }, a.name),
      el('div', { class: 'small' }, n ? el('a', { href: listHash([{ cat: 'actor', value: a.name }]) }, `${n} on your list`) : el('span', { class: 'muted' }, 'none on your list')),
      a.note ? el('div', { class: 'muted small' }, a.note) : null),
    heartBtn({ id: a.tmdbId, name: a.name, profile: a.profile }, a));
}
// A TMDB search result: face, name, and what they're known for (titles on your list stand out).
function personResult(h, onList) {
  const href = `#/actor/${h.id}`;
  return el('div', { class: 'person clickable', onclick: cardClick(href) },
    el('a', { href }, poster(h.profile, 'w185', 'face')),
    el('div', { class: 'person-body' }, el('a', { class: 'person-name', href }, h.name),
      h.knownFor.length ? el('div', { class: 'muted small' }, 'Known for: ', h.knownFor.map((k, i) => [i ? ', ' : '',
        onList.has(`${k.type}:${k.id}`) ? el('b', { class: 'on-list', title: 'On your list' }, k.title) : k.title])) : null),
    heartBtn({ id: h.id, name: h.name, profile: h.profile }, null));
}
