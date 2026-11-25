// Tag Deck (#/tags/deck?<any list filter>): one card per show. Fix the fields at the top, remove or add tags, then
// swipe right (or →, or Save) to save and move on, or left (←, Skip) to skip; skipped shows come back at the end.
// Nothing changes until you save a card, and Undo puts the last card back the way it was.
import { el, toast, today } from '../util.js';
import { state, readOnly, save, canEdit, showById } from '../state.js';
import { fieldOf, isSourced, setField, years } from '../shows.js';
import { applyFilters, favNamesFor } from '../categories.js';
import { route, filtersFrom } from '../router.js';
import { FICTION, TONE, ERA_ORDER } from '../sources.js';
import { classifyTag, similarTags, matchExisting, tagKey } from '../tagrules.js';
import { cached, tmdb } from '../tmdb.js';
import { keywordsOf } from '../sources.js';
import { poster } from '../ui.js';
import { tagCounts } from './tags.js';

const STRUCTURES = ['Serialized', 'Episodic', 'Mixed', 'Anthology'];
const FIELD_KINDS = ['genre', 'setting', 'era', 'origin', 'fiction', 'tone'];
let session = null; // { key, queue: [id], i, history: [], draft, saved, skipped }

// Order: shows you haven't reviewed first, then reviewed ones, each group shuffled so every session starts somewhere new.
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function buildQueue(shows) {
  return [...shuffle(shows.filter((s) => !s.tagsReviewedAt)), ...shuffle(shows.filter((s) => s.tagsReviewedAt))].map((s) => s.id);
}
// The fields section starts closed; opening or closing it sticks for later cards (and later visits, where storage works).
let fieldsOpen = (() => { try { return localStorage.getItem('deckFieldsOpen') === '1'; } catch { return false; } })();
function setFieldsOpen(v) { fieldsOpen = v; try { localStorage.setItem('deckFieldsOpen', v ? '1' : '0'); } catch { /* ignore */ } }
const sessionKey = (r) => r.params.toString();
function startSession(r) {
  const filters = filtersFrom(r.params);
  const shows = applyFilters(state.shows, filters, r.params.get('q') || '');
  const queue = buildQueue(shows);
  const first = r.params.get('id');
  if (first && showById(first)) { const j = queue.indexOf(first); if (j >= 0) queue.splice(j, 1); queue.unshift(first); }
  session = { key: sessionKey(r), queue, i: 0, history: [], draft: null, saved: 0, skipped: 0, run: 0, filtered: filters.length > 0 || !!r.params.get('q') };
}
function draftFor(s) {
  if (session.draft && session.draft.id === s.id) return session.draft;
  session.draft = { id: s.id, removed: [], added: [], fiction: fieldOf(s, 'fiction'), tone: fieldOf(s, 'tone'), structure: s.structure,
    era: [...fieldOf(s, 'era')], setting: [...fieldOf(s, 'setting')], country: s.country, languages: s.languages.join(', '), touched: {}, hint: null };
  return session.draft;
}

// ---------- Actions ----------
const KEYS = ['tags', 'fiction', 'tone', 'structure', 'era', 'setting', 'country', 'languages', 'tagsReviewedAt'];
function saveCard() {
  const s = showById(session.queue[session.i]);
  if (!s || !canEdit()) return;
  const d = draftFor(s);
  const before = JSON.parse(JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, s[k]]))));
  s.tags = [...s.tags.filter((t) => !d.removed.includes(t)), ...d.added.filter((t) => !s.tags.includes(t))];
  // Only fields you touched become your own values; the rest keep following TMDB/Wikidata.
  for (const k of ['fiction', 'tone', 'era', 'setting']) if (d.touched[k]) setField(s, k, d[k]);
  if (d.touched.structure) s.structure = d.structure;
  if (d.touched.country) s.country = d.country.trim();
  if (d.touched.languages) s.languages = d.languages.split(',').map((x) => x.trim()).filter(Boolean);
  s.tagsReviewedAt = today();
  session.history.push({ type: 'save', id: s.id, before, i: session.i, queue: [...session.queue], run: session.run });
  session.saved++;
  session.run = 0;
  session.i++;
  session.draft = null;
  save();
}
function skipCard() {
  const id = session.queue[session.i];
  if (!id) return;
  session.history.push({ type: 'skip', id, i: session.i, queue: [...session.queue], run: session.run });
  session.queue.splice(session.i, 1);
  session.queue.push(id); // comes back later
  session.skipped++;
  session.run++; // skips in a row: once every remaining show has been skipped, stop instead of going round again
  session.draft = null;
  rerender();
}
function undo() {
  const h = session.history.pop();
  if (!h) return toast('Nothing to undo.');
  session.queue = h.queue;
  session.i = h.i;
  session.run = h.run;
  session.draft = null;
  if (h.type === 'save') {
    const s = showById(h.id);
    if (s && canEdit()) { Object.assign(s, h.before); session.saved--; save(); toast(`Undone: ${s.title}`); return; }
  } else session.skipped--;
  rerender();
}
function rerender() {
  const main = document.getElementById('main');
  const r = route();
  if (r.name === 'tags' && r.id === 'deck') main.replaceChildren(viewDeck(r));
}
// Arrow keys and swipe. One listener for the whole app; it only acts on the deck page.
document.addEventListener('keydown', (e) => {
  const r = route();
  if (r.name !== 'tags' || r.id !== 'deck' || !session || readOnly) return;
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); saveCard(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); skipCard(); }
  else if ((e.key === 'z' && (e.metaKey || e.ctrlKey)) || e.key === 'u') { e.preventDefault(); undo(); }
});
function swipeable(card) {
  let x0 = null, y0 = null, dx = 0, id = null;
  card.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, select, a, label')) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; id = e.pointerId;
  });
  card.addEventListener('pointermove', (e) => {
    if (x0 == null || e.pointerId !== id) return;
    dx = e.clientX - x0;
    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(e.clientY - y0)) return;
    card.setPointerCapture(id);
    card.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
    card.classList.toggle('going-right', dx > 80);
    card.classList.toggle('going-left', dx < -80);
  });
  const end = () => {
    if (x0 == null) return;
    x0 = null;
    card.style.transform = '';
    card.classList.remove('going-right', 'going-left');
    if (dx > 80) saveCard(); else if (dx < -80) skipCard();
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', () => { x0 = null; card.style.transform = ''; });
}

// ---------- Suggestions ----------
// Tags common on similar shows (shared genres, shared favorite actors), skipping tags that belong in fields.
function similarShowTags(s, counts, genres) {
  const favs = new Set(favNamesFor(s));
  const scored = [];
  for (const o of state.shows) {
    if (o === s || !o.tags.length) continue;
    const g = o.genres.filter((x) => s.genres.includes(x)).length;
    const a = favs.size ? favNamesFor(o).filter((x) => favs.has(x)).length : 0;
    const sim = g + 2 * a + (g && o.structure && o.structure === s.structure ? 0.5 : 0) + (g && fieldOf(o, 'tone') && fieldOf(o, 'tone') === fieldOf(s, 'tone') ? 0.5 : 0);
    if (sim >= 1) scored.push([o, sim]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  const tally = new Map();
  for (const [o, sim] of scored.slice(0, 40)) for (const t of o.tags) {
    if (s.tags.includes(t) || (counts.get(t) || 0) < 2) continue;
    const c = classifyTag(t, genres);
    if (c && FIELD_KINDS.includes(c.kind)) continue;
    tally.set(t, (tally.get(t) || 0) + sim);
  }
  // Favor tags that are typical of these shows over tags common everywhere (Relationships, Teen…).
  for (const [t, v] of tally) tally.set(t, v / Math.sqrt(counts.get(t)));
  return [...tally].sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]);
}
function keywordTags(s, counts) {
  if (!s.tmdb || !s.tmdb.id) return Promise.resolve([]);
  // Keywords saved by Fill from TMDB, else ask TMDB.
  const stored = s.sourced && Array.isArray(s.sourced.keywords) ? Promise.resolve(s.sourced.keywords) : null;
  return (stored || cached(`keywords:${s.tmdb.type}:${s.tmdb.id}`, async () => keywordsOf({ keywords: await tmdb(`/${s.tmdb.type}/${s.tmdb.id}/keywords`) })))
    .then((kws) => [...new Set(kws.map((k) => matchExisting(k, counts)).filter((t) => t && !s.tags.includes(t)))]);
}

// ---------- Page ----------
export function viewDeck(r) {
  const wrap = el('div', { class: 'deck-page' });
  if (readOnly) return wrap.append(el('h1', {}, 'Tag Deck'), el('p', { class: 'muted' }, 'View only.')), wrap;
  if (!session || session.key !== sessionKey(r)) startSession(r);
  const reviewed = state.shows.filter((s) => s.tagsReviewedAt).length;
  const left = session.queue.length - session.i;
  wrap.append(el('div', { class: 'deck-top' },
    el('h1', {}, 'Tag Deck'),
    el('span', { class: 'muted small' }, `${reviewed.toLocaleString()} of ${state.shows.length.toLocaleString()} reviewed · `,
      session.filtered ? `${session.queue.length} shows in this deck · ` : '', `${left} to go`),
    el('a', { class: 'small', href: '#/tags' }, 'Tag cleanup')));
  const s = showById(session.queue[session.i]);
  const cycled = session.run && session.run >= session.queue.length - session.i;
  if (!s || cycled) {
    wrap.append(el('div', { class: 'card empty' }, el('h2', {}, !session.queue.length ? 'No shows here' : cycled ? `${left} skipped shows left` : 'All done'),
      el('p', {}, `Saved ${session.saved}, skipped ${session.skipped}.`),
      el('div', { class: 'btn-row' },
        session.history.length ? el('button', { class: 'btn', onclick: undo }, 'Undo last') : null,
        cycled ? el('button', { class: 'btn primary', onclick: () => { session.run = 0; rerender(); } }, 'Go through them again') : null,
        el('button', { class: 'btn', onclick: () => { session = null; rerender(); } }, 'Start again'),
        el('a', { class: 'btn', href: '#/' }, 'Browse'))));
    return wrap;
  }
  const counts = tagCounts();
  const genres = [...new Set(state.shows.flatMap((x) => x.genres))];
  const d = draftFor(s);
  const redraw = () => rerender();
  const touch = (k, v) => { d[k] = v; d.touched[k] = true; redraw(); };

  // Field pickers: one tap each. Blank fields are highlighted; values from TMDB/Wikidata are marked.
  const srcMark = (k) => (!d.touched[k] && isSourced(s, k) ? el('span', { class: 'src', title: `From ${(s.sourced.from && s.sourced.from[k]) || 'TMDB'}` }, s.sourced.from && s.sourced.from[k] === 'guess' ? 'guess' : 'TMDB') : null);
  const blank = (v) => (Array.isArray(v) ? !v.length : !v);
  const seg = (k, label, opts) => el('div', { class: `deck-field${blank(d[k]) ? ' blank' : ''}` },
    el('span', { class: 'deck-label' }, label, srcMark(k)),
    el('div', { class: 'seg' }, opts.map((o) => el('button', { type: 'button', class: `chip${d[k] === o ? ' pick-inc' : ''}`, 'aria-pressed': String(d[k] === o),
      onclick: () => touch(k, d[k] === o ? '' : o) }, o))));
  const multi = (k, label, opts) => el('div', { class: `deck-field${blank(d[k]) ? ' blank' : ''}` },
    el('span', { class: 'deck-label' }, label, srcMark(k)),
    el('div', { class: 'seg' }, opts.map((o) => el('button', { type: 'button', class: `chip${d[k].includes(o) ? ' pick-inc' : ''}`, 'aria-pressed': String(d[k].includes(o)),
      onclick: () => touch(k, d[k].includes(o) ? d[k].filter((x) => x !== o) : [...d[k], o]) }, o))));
  const places = () => {
    const input = el('input', { placeholder: 'Add a place', 'aria-label': 'Add a place', list: 'deck-places' });
    const add = () => { const v = input.value.trim(); if (v && !d.setting.includes(v)) touch('setting', [...d.setting, v]); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    return el('div', { class: `deck-field${blank(d.setting) ? ' blank' : ''}` },
      el('span', { class: 'deck-label' }, 'Setting', srcMark('setting')),
      el('div', { class: 'seg' }, d.setting.map((p) => el('button', { type: 'button', class: 'chip pick-inc', title: 'Remove', onclick: () => touch('setting', d.setting.filter((x) => x !== p)) }, p, el('span', { class: 'x' }, '×'))), input,
        el('datalist', { id: 'deck-places' }, [...new Set(state.shows.flatMap((x) => fieldOf(x, 'setting')))].sort().map((v) => el('option', { value: v })))));
  };
  const text = (k, label, ph) => {
    const input = el('input', { value: d[k], placeholder: ph, 'aria-label': label, onchange: () => { d[k] = input.value; d.touched[k] = true; input.closest('.deck-field').classList.toggle('blank', !input.value.trim()); } });
    return el('div', { class: `deck-field${blank(d[k]) ? ' blank' : ''}` }, el('span', { class: 'deck-label' }, label), input);
  };

  // Tags: tap to remove, tap again to restore. Added ones can be tapped off.
  const tagChips = el('div', { class: 'chips' },
    s.tags.map((t) => { const off = d.removed.includes(t); return el('button', { type: 'button', class: `chip${off ? ' removed' : ''}`, title: off ? 'Tap to keep' : 'Tap to remove',
      onclick: () => { d.removed = off ? d.removed.filter((x) => x !== t) : [...d.removed, t]; redraw(); } }, t, el('span', { class: 'x' }, off ? '↺' : '×')); }),
    d.added.map((t) => el('button', { type: 'button', class: 'chip pick-inc', title: 'Tap to take off', onclick: () => { d.added = d.added.filter((x) => x !== t); redraw(); } }, t, el('span', { class: 'x' }, '×'))),
    !s.tags.length && !d.added.length ? el('span', { class: 'muted small' }, 'No tags yet.') : null);
  const addTag = (t) => { if (t && !s.tags.includes(t) && !d.added.includes(t)) d.added.push(t); d.removed = d.removed.filter((x) => x !== t); d.hint = null; redraw(); };
  const suggest = el('div', { class: 'chips suggestions' });
  const fillSuggest = (list) => {
    const shown = list.filter(([t]) => !d.added.includes(t) && !s.tags.includes(t));
    suggest.replaceChildren(...(shown.length ? shown.map(([t, from]) => el('button', { type: 'button', class: 'chip suggest', title: from === 'tmdb' ? 'From TMDB keywords' : 'Common on similar shows', onclick: () => addTag(t) }, '+ ', t, from === 'tmdb' ? el('span', { class: 'count' }, 'TMDB') : null))
      : [el('span', { class: 'muted small' }, 'No suggestions.')]));
  };
  const fromSimilar = similarShowTags(s, counts, genres).map((t) => [t, 'similar']);
  const cur = new Set([...s.tags, ...d.added]);
  fillSuggest(fromSimilar.filter(([t]) => !cur.has(t)));
  keywordTags(s, counts).then((kt) => {
    if (!suggest.isConnected && !wrap.isConnected) return;
    const seen = new Set(fromSimilar.map((x) => x[0]));
    fillSuggest([...kt.filter((t) => !seen.has(t) && !cur.has(t)).map((t) => [t, 'tmdb']), ...fromSimilar.filter(([t]) => !cur.has(t))]);
  }).catch(() => {});

  // Add box: autocompletes from existing tags; a new tag close to an existing one asks "Did you mean…?" first.
  const addInput = el('input', { placeholder: 'Add a tag', 'aria-label': 'Add a tag', list: 'deck-tags', autocomplete: 'off' });
  const hint = el('div', { class: 'did-you-mean small' });
  const tryAdd = () => {
    const v = addInput.value.trim();
    if (!v) return;
    const exact = [...counts.keys()].find((t) => tagKey(t) === tagKey(v));
    if (exact) return addTag(exact);
    const like = similarTags(v, counts, 3);
    if (!like.length) return addTag(v);
    d.hint = { typed: v, like };
    redraw();
  };
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tryAdd(); } });
  if (d.hint) hint.append('Did you mean ', ...d.hint.like.flatMap((t, i) => [i ? ' or ' : '', el('button', { type: 'button', class: 'chip suggest', onclick: () => addTag(t) }, t)]),
    '? ', el('button', { type: 'button', class: 'btn small ghost', onclick: () => addTag(d.hint.typed) }, `Add “${d.hint.typed}” as a new tag`));

  // Fields are optional: tucked under a closed section with a one-line summary of what's there now.
  const summary = [d.fiction, d.tone, d.structure, d.era.join('/'), d.setting.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
  const fieldsBox = el('details', { class: 'deck-more', open: fieldsOpen, ontoggle: (e) => setFieldsOpen(e.target.open) },
    el('summary', {}, 'Fields', el('span', { class: 'muted small' }, summary ? ` · ${summary}` : ' · none set')),
    el('div', { class: 'deck-fields' },
      seg('fiction', 'Fiction', FICTION), seg('tone', 'Tone', TONE), seg('structure', 'Structure', STRUCTURES),
      multi('era', 'Era', ERA_ORDER), places(),
      el('div', { class: 'row' }, text('country', 'Country', 'UK, US'), text('languages', 'Language', 'English'))));
  const card = el('div', { class: 'card deck-card' },
    el('div', { class: 'deck-head' }, poster(s.tmdb && s.tmdb.poster, 'w185', 'poster'),
      el('div', {},
        el('h2', {}, el('a', { href: `#/show/${encodeURIComponent(s.id)}` }, s.title)),
        el('div', { class: 'muted small' }, [years(s), s.format, s.network].filter(Boolean).join(' · ')),
        el('div', { class: 'small' }, s.genres.join(' · ')),
        s.tagsReviewedAt ? el('div', { class: 'muted small' }, `Reviewed ${s.tagsReviewedAt}`) : null)),
    el('h3', {}, 'Tags'), tagChips,
    el('div', { class: 'row' }, addInput, el('button', { class: 'btn small', type: 'button', onclick: tryAdd }, 'Add')),
    el('datalist', { id: 'deck-tags' }, [...counts.keys()].sort().map((t) => el('option', { value: t }))),
    hint,
    el('h3', {}, 'Suggested'), suggest,
    fieldsBox);
  swipeable(card);
  wrap.append(card, el('div', { class: 'deck-actions' },
    el('button', { class: 'btn', onclick: skipCard, title: 'Skip (←); it comes back later' }, '← Skip'),
    el('button', { class: 'btn ghost', onclick: undo, disabled: !session.history.length, title: 'Undo (U)' }, 'Undo'),
    el('button', { class: 'btn primary', onclick: saveCard, title: 'Save and next (→)' }, 'Save →')),
    el('p', { class: 'muted small center' }, 'Swipe right or press → to save, left or ← to skip. Nothing changes until you save.'));
  return wrap;
}
