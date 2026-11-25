// A show on the list: details, pickers, notes, edit dialog, cast.
import { toNum, el, toast, uniq } from '../util.js';
import { state, readOnly, save, canEdit, showById } from '../state.js';
import { isMovie, fieldOf, isSourced, setField, SOURCED_KEYS } from '../shows.js';
import { FICTION, TONE, ERA_ORDER } from '../sources.js';
import { fillOne } from '../fill.js';
import { stars } from '../categories.js';
import { getCast, getDetails } from '../tmdb.js';
import { linkShow, fillFromTmdb, checkFacts, setStatus } from '../library.js';
import { imagesSection } from '../images.js';
import { whereToWatch } from '../watch.js';
import { describeNext, fmtDate, updateFor } from '../facts.js';
import { chipLink, poster, metaLine, SELECTS, personTile, tmdbPicker } from '../ui.js';
import { listHash } from '../router.js';
import { recordView } from '../recent.js';

export function viewShow(r) {
  const s = showById(r.id);
  if (!s) return el('p', { class: 'muted' }, 'Show not found. ', el('a', { href: '#/' }, 'Back to browse'));
  recordView({ kind: 'show', id: s.id });
  const wrap = el('div', { class: 'show-page' });
  const images = imagesSection(s);
  const field = (key, label) => {
    const sel = el('select', { disabled: readOnly, onchange: () => {
      if (!canEdit()) return;
      const unlocked = key === 'status' ? setStatus(s, sel.value) : ((s[key] = sel.value), false);
      save({ quiet: true });
      if (unlocked && images && images.refresh) images.refresh();
      toast(unlocked ? 'Saved · spoilers on' : 'Saved');
    } },
      SELECTS[key]().map((v) => el('option', { value: v, selected: v === s[key] }, v || '—')));
    return el('label', { class: 'field' }, label, sel);
  };
  const notes = el('textarea', { rows: 3, readOnly, placeholder: 'Notes' }, s.notes);
  notes.addEventListener('change', () => { if (!canEdit()) return; s.notes = notes.value; save({ quiet: true }); toast('Saved'); });

  const chips = (cat, list) => el('div', { class: 'chips' }, list.map((v) => chipLink(cat, v)));
  wrap.append(el('div', { class: 'show-head' },
    poster(s.tmdb && s.tmdb.poster, 'w342', 'poster big'),
    el('div', { class: 'show-head-body' },
      el('h1', {}, s.title),
      el('p', { class: 'muted' }, metaLine(s)),
      s.showStatus || s.structure || s.country ? el('p', { class: 'small' },
        [s.showStatus && `Show status: ${s.showStatus}`, s.structure, [s.country, s.languages.join(', ')].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')) : null,
      factsLine(s),
      whereToWatch(s.tmdb),
      chips('genre', s.genres), sourcedFields(s), chips('tag', s.tags),
      descriptionBox(s),
      el('div', { class: 'fields' }, field('status', 'My status'), field('want', 'Want to watch?'), field('recommend', 'Use to recommend'), ratingField(s)),
      el('label', { class: 'field wide' }, 'Notes', notes),
      s.researchNotes ? el('p', { class: 'small muted' }, `Research notes: ${s.researchNotes}`) : null,
      s.sources.length ? el('p', { class: 'small muted' }, `Source: ${s.sources.join(', ')}`) : null,
      el('div', { class: 'btn-row edit-only' },
        el('button', { class: 'btn', onclick: () => openEdit(s) }, 'Edit details'),
        s.tmdb && s.tmdb.id ? el('button', { class: 'btn', onclick: (e) => fillBoth(s, e.target) }, 'Fill blanks from TMDB') : null,
        el('a', { class: 'btn', href: `#/tags/deck?id=${encodeURIComponent(s.id)}` }, 'Review in Tag Deck'),
        s.tmdb && s.tmdb.id && s.tmdb.type === 'tv' ? el('button', { class: 'btn', onclick: (e) => checkOne(s, e.target) }, 'Check for updates') : null,
        el('button', { class: 'btn danger', onclick: () => deleteShow(s) }, 'Delete')))));
  if (images) wrap.append(images);
  wrap.append(castSection(s));
  return wrap;
}
// What TMDB said at the last check, kept apart from your own show status label above it.
function factsLine(s) {
  const f = s.facts;
  if (!f) return null;
  return el('p', { class: 'small muted facts-line' },
    `TMDB, checked ${fmtDate(f.checkedAt)}: ${[f.status, describeNext(f)].filter(Boolean).join(', ')}`,
    !readOnly && updateFor(s) ? el('span', {}, ' · ', el('a', { href: '#/updates' }, 'something to review')) : null);
}
// Fiction · Tone · Era · Setting, each a link to that browse value. Values from TMDB/Wikidata are marked.
const FIELD_LABELS = { fiction: 'Fiction', tone: 'Tone', era: 'Era', setting: 'Setting' };
function sourcedFields(s) {
  const bits = SOURCED_KEYS.map((k) => {
    const v = fieldOf(s, k);
    const list = Array.isArray(v) ? v : v ? [v] : [];
    if (!list.length) return null;
    const src = isSourced(s, k) && s.sourced.from && s.sourced.from[k];
    return el('span', { class: 'field-bit' }, el('span', { class: 'muted' }, `${FIELD_LABELS[k]}: `),
      list.map((x, i) => [i ? ', ' : '', el('a', { href: listHash([{ cat: k, value: x }]) }, x)]),
      isSourced(s, k) ? el('span', { class: 'src', title: src === 'guess' ? 'Guessed: nothing said otherwise' : `From ${src || 'TMDB'}; Edit details to change` }, src === 'guess' ? ' (guess)' : ' ·') : null);
  }).filter(Boolean);
  return bits.length ? el('p', { class: 'small sourced-fields' }, bits.map((b, i) => [i ? '  ' : '', b])) : null;
}
async function fillBoth(s, btn) {
  if (!canEdit()) return;
  btn.disabled = true;
  await fillFromTmdb(s);
  try { await fillOne(s); } catch (e) { toast(e.message); }
  btn.disabled = false;
}
async function checkOne(s, btn) {
  if (!canEdit()) return;
  btn.disabled = true;
  try {
    const changes = await checkFacts(s);
    save();
    toast(changes.length ? changes.join(' · ') : `TMDB: ${s.facts.status}. Nothing new since the last check.`);
  } catch (e) { toast(e.message); btn.disabled = false; }
}
// 1–5 stars. Tapping the current rating clears it.
function ratingField(s) {
  const box = el('div', { class: 'stars', role: 'group', 'aria-label': 'My rating' });
  const draw = () => box.replaceChildren(...[1, 2, 3, 4, 5].map((n) => el('button', {
    class: `star${s.rating >= n ? ' on' : ''}`, disabled: readOnly, title: s.rating === n ? 'Clear rating' : `${n} star${n > 1 ? 's' : ''}`,
    'aria-pressed': String(s.rating === n),
    onclick: () => { if (!canEdit()) return; s.rating = s.rating === n ? null : n; save({ quiet: true }); draw(); toast(s.rating ? `Rated ${stars(s.rating)}` : 'Rating cleared'); },
  }, s.rating >= n ? '★' : '☆')));
  draw();
  return el('div', { class: 'field' }, 'My rating', box);
}
// TMDB's summary, collapsed so it doesn't push the pickers and notes down.
export function descriptionBox(s) {
  if (!s.tmdb || !s.tmdb.id) return null;
  const box = el('details', { class: 'description', hidden: true });
  getDetails(s.tmdb).then((d) => {
    if (!d.overview) return;
    box.append(el('summary', {}, 'Description'), d.tagline ? el('p', { class: 'small muted' }, el('i', {}, d.tagline)) : null, el('p', {}, d.overview));
    box.hidden = false;
  }).catch(() => {});
  return box;
}
export function deleteShow(s) {
  if (!canEdit() || !confirm(`Delete “${s.title}” from your list?`)) return;
  const i = state.shows.indexOf(s);
  state.shows.splice(i, 1);
  save({ quiet: true });
  history.back();
  toast(`Deleted ${s.title}`, { label: 'Undo', run: () => { state.shows.splice(i, 0, s); save(); } });
}

export const EDIT_FIELDS = [
  ['title', 'Title'], ['format', 'Format'], ['year', 'Release year', 'number'], ['endYear', 'End year', 'number'],
  ['seasons', 'Seasons', 'number'], ['episodes', 'Episodes', 'number'], ['epLength', 'Episode length (min)', 'number'],
  ['showStatus', 'Show status'], ['genres', 'Genres (comma-separated)', 'list'], ['structure', 'Structure'],
  ['country', 'Country'], ['languages', 'Languages (comma-separated)', 'list'],
  ['fiction', 'Fiction', 'choice', FICTION], ['tone', 'Tone', 'choice', TONE], ['era', `Era (comma-separated: ${ERA_ORDER.join(', ')})`, 'list'],
  ['setting', 'Setting (comma-separated places, most specific: Brooklyn, not US)', 'list'], ['tags', 'Tags (comma-separated)', 'list'],
  ['network', 'Network / platform'], ['sources', 'Source (comma-separated)', 'list'], ['confidence', 'Research confidence'],
  ['researchNotes', 'Research notes'],
];
const cur = (s, k) => (SOURCED_KEYS.includes(k) ? fieldOf(s, k) : s[k]);
export function openEdit(s) {
  if (!canEdit()) return;
  const dlg = el('dialog', { class: 'edit-dialog' });
  const form = el('form', { method: 'dialog', class: 'edit-form' },
    el('h2', {}, `Edit ${s.title}`),
    EDIT_FIELDS.map(([k, label, type, opts]) => el('label', { class: 'field' }, label,
      isSourced(s, k) ? el('span', { class: 'muted small' }, ' (from TMDB/Wikidata)') : null,
      type === 'choice' ? el('select', { name: k }, ['', ...opts].map((v) => el('option', { value: v, selected: v === fieldOf(s, k) }, v || '—'))) :
      el('input', { name: k, type: type === 'number' ? 'number' : 'text', value: type === 'list' ? cur(s, k).join(', ') : cur(s, k) ?? '',
        list: ['format', 'showStatus', 'structure', 'network', 'country', 'confidence'].includes(k) ? `dl-${k}` : null }))),
    ['format', 'showStatus', 'structure', 'network', 'country', 'confidence'].map((k) =>
      el('datalist', { id: `dl-${k}` }, uniq(state.shows.map((x) => x[k])).filter(Boolean).sort().map((v) => el('option', { value: v })))),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn primary', value: 'save' }, 'Save'),
      el('button', { class: 'btn', value: 'cancel', formnovalidate: true }, 'Cancel')));
  dlg.append(form);
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'save') {
      for (const [k, , type] of EDIT_FIELDS) {
        const v = form.elements[k].value.trim();
        const val = type === 'number' ? toNum(v) : type === 'list' ? v.split(',').map((x) => x.trim()).filter(Boolean) : v;
        if (SOURCED_KEYS.includes(k)) { if (JSON.stringify(val) !== JSON.stringify(fieldOf(s, k))) setField(s, k, val); }
        else s[k] = val;
      }
      if (!s.title) s.title = 'Untitled';
      save();
      toast('Saved');
    }
    dlg.remove();
  });
  document.body.append(dlg);
  dlg.showModal();
}

export function castSection(s) {
  const sec = el('section', { class: 'card cast' }, el('h2', {}, 'Cast'));
  if (!s.tmdb || !s.tmdb.id) {
    sec.append(el('p', { class: 'muted small' }, s.tmdb && s.tmdb.none ? 'Marked as not on TMDB.' : 'Link this title to TMDB to see its cast.'));
    if (!readOnly) sec.append(tmdbPicker(s.title, isMovie(s) ? 'movie' : 'tv', s.year, (hit) => linkShow(s, hit)));
    return sec;
  }
  const grid = el('div', { class: 'cast-grid' }, el('p', { class: 'muted' }, 'Loading cast…'));
  sec.append(grid);
  getCast(s.tmdb).then((cast) => {
    grid.replaceChildren(...cast.map((c) => personTile(c, c.character + (c.episodes ? ` · ${c.episodes} ep` : ''))));
    if (!cast.length) grid.append(el('p', { class: 'muted' }, 'No cast listed on TMDB.'));
  }).catch((e) => grid.replaceChildren(el('p', { class: 'muted' }, e.message)));
  if (!readOnly) sec.append(el('button', { class: 'btn small ghost', onclick: () => { if (canEdit() && confirm('Unlink from TMDB?')) { s.tmdb = null; save(); } } }, 'Wrong show? Unlink from TMDB'));
  return sec;
}
