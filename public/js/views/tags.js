// Tag cleanup (#/tags): merge duplicates, drop tags that repeat a genre, move tags into fields, rename or merge any tag,
// and go through one-off tags. Every bulk change can be undone from the toast.
import { el, toast } from '../util.js';
import { state, readOnly, save, canEdit } from '../state.js';
import { fieldOf, setField, isSourced } from '../shows.js';
import { listHash, recall, remember } from '../router.js';
import { classifyTag, duplicateGroups, similarTags, tagKey } from '../tagrules.js';
import { linkedShows } from '../fill.js';
import { viewDeck } from './deck.js';
import { viewTagMode } from './tagmode.js';

// ---------- Changes (also used by the deck) ----------
const SNAP_KEYS = ['tags', 'genres', 'country', 'languages', 'fiction', 'tone', 'era', 'setting'];
export function snapshot(shows = state.shows) {
  return new Map(shows.map((s) => [s.id, JSON.parse(JSON.stringify(Object.fromEntries(SNAP_KEYS.map((k) => [k, s[k]]))))]));
}
export function restore(snap) {
  for (const s of state.shows) { const v = snap.get(s.id); if (v) Object.assign(s, v); }
}
// Run a change on the list, save, and offer Undo.
function change(msg, fn) {
  if (!canEdit()) return;
  const snap = snapshot();
  const n = fn();
  if (n === 0) return toast('Nothing to change.');
  save();
  toast(typeof msg === 'function' ? msg(n) : msg, { label: 'Undo', run: () => { restore(snap); save(); toast('Undone'); } });
}
export function tagCounts(shows = state.shows) {
  const m = new Map();
  for (const s of shows) for (const t of s.tags) m.set(t, (m.get(t) || 0) + 1);
  return m;
}
// Rename (or merge into an existing tag) on every show. Returns how many shows changed.
export function renameTag(from, to) {
  let n = 0;
  for (const s of state.shows) {
    if (!s.tags.includes(from)) continue;
    const out = [];
    for (const t of s.tags) { const v = t === from ? to : t; if (v && !out.includes(v)) out.push(v); }
    s.tags = out; n++;
  }
  return n;
}
export function removeTag(tag, only = () => true) {
  let n = 0;
  for (const s of state.shows) if (s.tags.includes(tag) && only(s)) { s.tags = s.tags.filter((t) => t !== tag); n++; }
  return n;
}
// Put a tag's meaning into a field where that field is blank (never over your own value). Returns true if anything was set.
export function moveToField(s, field, value) {
  if (!value) return false;
  if (field === 'country') { if (s.country) return false; s.country = value; return true; }
  if (field === 'language') { if (s.languages.length) return false; s.languages = [value]; return true; }
  if (field === 'genres') { if (s.genres.includes(value)) return false; s.genres = [...s.genres, value]; return true; }
  if (field === 'fiction') {
    const cur = fieldOf(s, 'fiction');
    // "Scripted" from TMDB is only the default when nothing else was found, so a True Story tag wins over it.
    if (cur && !(isSourced(s, 'fiction') && cur === 'Scripted')) return false;
    setField(s, 'fiction', value); return true;
  }
  if (field === 'tone') { if (fieldOf(s, 'tone')) return false; setField(s, 'tone', value); return true; }
  if (field === 'era' || field === 'setting') {
    const cur = fieldOf(s, field);
    const guessed = field === 'era' && isSourced(s, 'era') && s.sourced.from && s.sourced.from.era === 'guess';
    if (cur.length && !guessed) return false;
    setField(s, field, [value]); return true;
  }
  return false;
}

// ---------- Page ----------
export function viewTags(r) {
  if (r.id === 'deck') return viewDeck(r);
  if (r.id === 'mode') return viewTagMode(r);
  const wrap = el('div', { class: 'tags-page' }, el('h1', {}, 'Tag cleanup'));
  if (readOnly) return wrap.append(el('p', { class: 'muted' }, 'View only.')), wrap;
  const counts = tagCounts();
  const genres = [...new Set(state.shows.flatMap((s) => s.genres))];
  const reviewed = state.shows.filter((s) => s.tagsReviewedAt).length;
  const ones = [...counts].filter(([, n]) => n === 1);
  wrap.append(el('p', { class: 'muted' }, `${counts.size} distinct tags, ${ones.length} used once. ${reviewed} of ${state.shows.length} shows reviewed in the Tag Deck. `,
    el('a', { href: '#/tags/deck' }, 'Open the Tag Deck'), ' · ', el('a', { href: '#/tags/mode' }, 'Tag Mode'), ' (one tag, many shows)'));
  const tagLink = (t, n) => el('a', { class: 'chip', href: listHash([{ cat: 'tag', value: t }]) }, t, n != null ? el('span', { class: 'count' }, n) : null);

  // 1. Duplicates
  const dupes = duplicateGroups(counts);
  if (dupes.length) {
    const mergeAll = () => change((n) => `Merged ${dupes.length} groups (${n} shows)`, () => dupes.reduce((a, g) => a + g.others.reduce((b, o) => b + renameTag(o, g.keep), 0), 0));
    wrap.append(section(`Same tag, different spelling (${dupes.length})`, 'Tags that differ only in capitals, hyphens or spaces. The most used spelling is kept; tap another spelling to keep that one instead.',
      el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', onclick: mergeAll }, `Merge all ${dupes.length}`)),
      el('ul', { class: 'tag-rows' }, dupes.map((g) => el('li', {},
        [g.keep, ...g.others].map((t) => el('button', { class: `chip ${t === g.keep ? 'pick-inc' : ''}`, title: t === g.keep ? 'Kept' : 'Keep this spelling instead',
          onclick: () => change(`Merged into “${t}”`, () => [g.keep, ...g.others].filter((x) => x !== t).reduce((a, o) => a + renameTag(o, t), 0)) }, t, el('span', { class: 'count' }, counts.get(t)))))))));
  }

  // 2. Tags that repeat a genre
  const repeats = new Map(); // tag -> { genre, both, without }
  for (const [t] of counts) {
    const c = classifyTag(t, genres);
    if (!c || c.kind !== 'genre') continue;
    const has = state.shows.filter((s) => s.tags.includes(t));
    repeats.set(t, { genre: c.value, both: has.filter((s) => s.genres.includes(c.value)).length, without: has.filter((s) => !s.genres.includes(c.value)).length });
  }
  const bothTotal = [...repeats.values()].reduce((a, x) => a + x.both, 0);
  if (repeats.size) {
    wrap.append(section(`Tags that repeat a genre (${repeats.size})`,
      'Where the show already has the genre, the tag adds nothing. Where it doesn\'t, you can turn the tag into the genre.',
      el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', disabled: !bothTotal,
        onclick: () => change((n) => `Removed from ${n} shows that already had the genre`, () => [...repeats].reduce((a, [t, x]) => a + removeTag(t, (s) => s.genres.includes(x.genre)), 0)) },
      `Remove where the genre is already there (${bothTotal})`)),
      el('ul', { class: 'tag-rows' }, [...repeats].map(([t, x]) => el('li', {}, tagLink(t, counts.get(t)),
        el('span', { class: 'muted small' }, ` ${x.both} already have the genre`),
        x.without ? el('button', { class: 'btn small', onclick: () => change(`“${t}” is now the ${x.genre} genre on ${x.without} shows`,
          () => { let n = 0; for (const s of state.shows) if (s.tags.includes(t)) { moveToField(s, 'genres', x.genre); s.tags = s.tags.filter((y) => y !== t); n++; } return n; }) },
        `Make it the genre on ${x.without}`) : null)))));
  }

  // 3. Move into a field: fiction, tone, and the ambiguous ones (country, language or setting?)
  const cls = [...counts].map(([t, n]) => ({ t, n, c: classifyTag(t, genres) })).filter((x) => x.c);
  const movable = cls.filter((x) => x.c.kind === 'fiction' || x.c.kind === 'tone');
  const ambiguous = cls.filter((x) => x.c.kind === 'ambiguous' && !(state.tagKeep || {})[x.t]);
  const moveTag = (t, field, value) => change(`“${t}” moved to ${field === 'language' ? 'Language' : field[0].toUpperCase() + field.slice(1)}: ${value}`, () => {
    let n = 0; for (const s of state.shows) if (s.tags.includes(t)) { moveToField(s, field, value); s.tags = s.tags.filter((y) => y !== t); n++; } return n; });
  if (movable.length || ambiguous.length) {
    const label = (c) => `${c.field === 'fiction' ? 'Fiction' : 'Tone'}: ${c.value}`;
    wrap.append(section('Move into a field', 'Sets the field where it is blank (or where TMDB only said “Scripted”), then removes the tag. Your own values are never replaced.',
      movable.length ? el('div', { class: 'btn-row' }, el('button', { class: 'btn primary',
        onclick: () => change((n) => `Moved ${movable.length} tags into fields (${n} shows)`, () => movable.reduce((a, x) => { let n = 0; for (const s of state.shows) if (s.tags.includes(x.t)) { moveToField(s, x.c.field, x.c.value); s.tags = s.tags.filter((y) => y !== x.t); n++; } return a + n; }, 0)) },
      `Move all ${movable.length}`)) : null,
      el('ul', { class: 'tag-rows' }, movable.map((x) => el('li', {}, tagLink(x.t, x.n), ' → ', el('b', {}, label(x.c)),
        el('button', { class: 'btn small', onclick: () => moveTag(x.t, x.c.field, x.c.value) }, 'Move')))),
      ambiguous.length ? el('h3', {}, 'Which does it mean?') : null,
      el('ul', { class: 'tag-rows' }, ambiguous.map((x) => el('li', {}, tagLink(x.t, x.n), ' ',
        Object.entries(x.c.choices).map(([f, v]) => el('button', { class: 'btn small', onclick: () => (f === 'setting' ? setTag(x.t, v) : moveTag(x.t, f, v)) },
          `${{ country: 'Country', language: 'Language', setting: 'Setting' }[f]}: ${v}`)),
        el('button', { class: 'btn small ghost', onclick: () => keepTag(x.t) }, 'Keep as a tag'))))));
  }
  function setTag(t, place) { moveTag(t, 'setting', place); }

  // 4. Setting, era and origin tags
  const filled = linkedShows().filter((s) => s.sourced).length;
  const sweep = cls.filter((x) => ['setting', 'era', 'origin'].includes(x.c.kind));
  if (sweep.length) {
    const uses = sweep.reduce((a, x) => a + x.n, 0);
    const what = (c) => (c.kind === 'origin' ? `Country: ${c.value}` : c.kind === 'era' && c.value ? `Era: ${c.value}` : null);
    const run = () => change((n) => `Removed ${sweep.length} setting, era and origin tags from ${n} shows`, () => {
      let n = 0;
      for (const s of state.shows) {
        const before = s.tags.length;
        for (const x of sweep) if (s.tags.includes(x.t)) { if (x.c.kind !== 'setting') moveToField(s, x.c.field, x.c.value); }
        s.tags = s.tags.filter((t) => !sweep.some((x) => x.t === t));
        if (s.tags.length !== before) n++;
      }
      return n;
    });
    wrap.append(section(`Setting, era and origin tags (${sweep.length}, ${uses} uses)`,
      'Setting and era now come from TMDB and Wikidata (Fill from TMDB), so these tags go. Origin tags (British…) and decade tags (1980s…) first fill Country or Era where blank, so nothing is lost. Place tags are deleted, as decided.',
      filled < linkedShows().length / 2 ? el('p', { class: 'small error' }, `Only ${filled} of ${linkedShows().length} linked shows have been filled so far. `, el('a', { href: '#/fill' }, 'Fill from TMDB'), ' first.') : null,
      el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', onclick: () => { if (confirm(`Remove ${sweep.length} tags (${uses} uses)? You can undo right after.`)) run(); } }, `Remove all ${sweep.length}`)),
      el('div', { class: 'chips' }, sweep.sort((a, b) => b.n - a.n).map((x) => el('span', { class: 'chip-wrap' }, tagLink(x.t, x.n),
        what(x.c) ? el('span', { class: 'muted small' }, ` → ${what(x.c)}`) : null)))));
  }

  // 5. Rename or merge any tag
  const filter = el('input', { type: 'search', placeholder: 'Find a tag', 'aria-label': 'Find a tag' });
  const all = el('ul', { class: 'tag-rows all-tags' });
  const drawAll = () => {
    const q = tagKey(filter.value);
    const rows = [...counts].filter(([t]) => !q || tagKey(t).includes(q)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, q ? 200 : 60);
    all.replaceChildren(...rows.map(([t, n]) => {
      const input = el('input', { value: t, 'aria-label': `Rename ${t}` });
      const go = () => {
        const to = input.value.trim();
        if (!to || to === t) { input.value = t; return; }
        const exists = counts.has(to);
        if (exists && !confirm(`Merge “${t}” (${n}) into “${to}” (${counts.get(to)})?`)) { input.value = t; return; }
        change(`${exists ? 'Merged into' : 'Renamed to'} “${to}”`, () => renameTag(t, to));
      };
      input.addEventListener('change', go);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      return el('li', {}, input, el('a', { class: 'muted small', href: listHash([{ cat: 'tag', value: t }]) }, `${n} show${n === 1 ? '' : 's'}`),
        el('button', { class: 'btn small ghost danger', title: 'Delete from every show', onclick: () => { if (confirm(`Delete “${t}” from ${n} show${n === 1 ? '' : 's'}?`)) change(`Deleted “${t}”`, () => removeTag(t)); } }, '✕'));
    }));
  };
  filter.addEventListener('input', drawAll);
  drawAll();
  wrap.append(section('Rename or merge a tag', 'Edit a name to rename it on every show. Typing the name of another tag merges the two.', filter, all));

  // 6. One-off tags
  const keep = state.tagKeep || {};
  const oneOffs = ones.map(([t]) => t).filter((t) => !keep[t]).sort((a, b) => a.localeCompare(b));
  const oneList = el('ul', { class: 'tag-rows' });
  let shown = 0;
  const more = el('button', { class: 'btn small', onclick: () => { page(shown + 40); remember('oneOffs', shown); } }, 'Show more');
  const others = new Map([...counts].filter(([, n]) => n > 1));
  function page(upTo) {
    for (const t of oneOffs.slice(shown, upTo)) {
      const s = state.shows.find((x) => x.tags.includes(t));
      const like = similarTags(t, others, 2);
      oneList.append(el('li', {}, el('b', {}, t), ' ', s ? el('a', { class: 'muted small', href: `#/show/${encodeURIComponent(s.id)}` }, s.title) : null, ' ',
        like.map((o) => el('button', { class: 'btn small', onclick: () => change(`Merged “${t}” into “${o}”`, () => renameTag(t, o)) }, `Merge into ${o}`)),
        el('button', { class: 'btn small ghost', onclick: () => keepTag(t) }, 'Keep'),
        el('button', { class: 'btn small ghost danger', onclick: () => change(`Deleted “${t}”`, () => removeTag(t)) }, 'Delete')));
    }
    shown = upTo;
    more.hidden = shown >= oneOffs.length;
  }
  page(recall('oneOffs', 40));
  wrap.append(section(`Used once (${oneOffs.length})`, `Merge into a similar tag, keep, or delete. Kept ones stop showing here (${Object.keys(keep).length} kept).`, oneList, more));
  return wrap;
}
function keepTag(t) {
  if (!canEdit()) return;
  state.tagKeep = { ...(state.tagKeep || {}), [t]: true };
  save();
  toast(`Keeping “${t}”`, { label: 'Undo', run: () => { const k = { ...(state.tagKeep || {}) }; delete k[t]; state.tagKeep = k; save(); } });
}
function section(title, sub, ...kids) {
  return el('section', { class: 'card' }, el('h2', {}, title), sub ? el('p', { class: 'muted small' }, sub) : null, ...kids);
}
