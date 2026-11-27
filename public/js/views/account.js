// Account, backup, import and export.
import { el, toast, download, today, storageUsed } from '../util.js';
import { state, setState, normalizeState, save, canEdit } from '../state.js';
import { totalHours, fieldOf } from '../shows.js';
import { favNamesFor, SORTS } from '../categories.js';
import { render } from '../router.js';
import { APP_VERSION } from '../version.js';
import { progressLabel } from '../progress.js';
import { watchRegion, regionLabel, myServices, isMine } from '../watch.js';

// ---------- Account, backup, export ----------
export const EXPORT_COLS = [
  ['Title', (s) => s.title], ['My Status', (s) => s.status], ['Want to Watch?', (s) => s.want],
  ['Use to recommend similar shows', (s) => s.recommend], ['My Rating', (s) => s.rating || ''], ['Source', (s) => s.sources.join(', ')], ['Notes', (s) => s.notes],
  ['Format', (s) => s.format], ['Release Year', (s) => s.year], ['End Year', (s) => s.endYear], ['Seasons', (s) => s.seasons],
  ['Episodes', (s) => s.episodes], ['Episode Length (min)', (s) => s.epLength], ['Total Hours', (s) => { const h = totalHours(s); return h == null ? '' : Math.round(h * 10) / 10; }],
  ['Show Status', (s) => s.showStatus], ['Genre', (s) => s.genres.join(', ')], ['Structure', (s) => s.structure],
  ['Country', (s) => s.country], ['Language', (s) => s.languages.join(', ')],
  ['Fiction', (s) => fieldOf(s, 'fiction')], ['Tone', (s) => fieldOf(s, 'tone')], ['Era', (s) => fieldOf(s, 'era').join(', ')],
  ['Setting', (s) => fieldOf(s, 'setting').join(', ')], ['Tags', (s) => s.tags.join(', ')],
  ['Original Network/Platform', (s) => s.network], ['Favorite Actors', (s) => favNamesFor(s).join(', ')],
  ['Confidence', (s) => s.confidence], ['Research Notes', (s) => s.researchNotes],
  ['TMDB', (s) => (s.tmdb && s.tmdb.id ? `https://www.themoviedb.org/${s.tmdb.type}/${s.tmdb.id}` : '')],
  ['TMDB Status (last check)', (s) => (s.facts ? s.facts.status : '')],
  ['Progress', (s) => progressLabel(s)],
  ['On My Services', (s) => (s.watch ? [...(s.watch.stream || []), ...(s.watch.free || [])].filter(isMine).join(', ') : '')],
  ['Spoilers', (s) => (s.spoilers ? 'On' : '')],
];
export function exportRows() {
  render(); // make sure the favorite-actor index is current
  const safe = (v) => (v == null ? '' : typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);
  return [EXPORT_COLS.map((c) => c[0]), ...[...state.shows].sort(SORTS.title[1]).map((s) => EXPORT_COLS.map(([, f]) => safe(f(s))))];
}
export function toCsv(rows) {
  return rows.map((r) => r.map((v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(',')).join('\n');
}
export async function exportToSheet(btn) {
  if (!canEdit()) return;
  btn.disabled = true;
  try {
    const token = window.cloud && window.cloud.token && await window.cloud.token();
    if (!token) throw new Error('Sign in first.');
    const res = await fetch('/.netlify/functions/sheet-export', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: exportRows() }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.error || `Export failed (${res.status})`);
    toast(`Google Sheet updated: ${out.rows} rows`);
  } catch (e) { toast(e.message); }
  btn.disabled = false;
}
export function importFile(file) {
  if (!canEdit()) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch { return toast('That file is not valid JSON.'); }
    if (!Array.isArray(data.shows)) return toast('No shows in that file.');
    const msg = state.shows.length
      ? `Replace your ${state.shows.length} shows and ${state.actors.length} actors with the ${data.shows.length} shows in this file?`
      : `Import ${data.shows.length} shows?`;
    if (!confirm(msg)) return;
    setState(normalizeState(data));
    save();
    toast(`Imported ${state.shows.length} shows`);
  };
  reader.readAsText(file);
}
// How much each part takes on this device, and how much of the list is TMDB-derived rather than typed by you.
// Step 1 of the storage plan: decides whether facts/sourced/credits should move out of the synced list.
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
const kb = (n) => (n >= 1048576 ? mb(n) : `${Math.round(n / 1024)} KB`);
export function storageReport() {
  const keys = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); keys.push([k, ((localStorage.getItem(k) || '').length + k.length) * 2]); } } catch {}
  keys.sort((a, b) => b[1] - a[1]);
  const size = (v) => (v == null ? 0 : JSON.stringify(v).length * 2);
  const parts = { 'TMDB facts (Updates)': 0, 'Sourced fields and keywords': 0, 'Where to watch': 0, 'Favorite actors\' credits': 0 };
  for (const sh of state.shows) {
    parts['TMDB facts (Updates)'] += size(sh.facts);
    parts['Sourced fields and keywords'] += size(sh.sourced);
    parts['Where to watch'] += size(sh.watch);
  }
  for (const a of state.actors) parts['Favorite actors\' credits'] += size(a.credits);
  const total = size(state);
  const derived = Object.values(parts).reduce((a, b) => a + b, 0);
  return { keys, parts, total, derived, used: storageUsed() };
}
function storageSection() {
  const box = el('div');
  const draw = () => {
    const r = storageReport();
    box.replaceChildren(
      el('p', { class: 'small' }, `This device keeps ${mb(r.used)} for the app (browsers allow about 5 MB). The list itself is ${kb(r.total)}, of which ${kb(r.derived)} (${Math.round((r.derived / Math.max(1, r.total)) * 100)}%) is TMDB-derived.`),
      el('table', { class: 'small tally' },
        el('tr', {}, el('th', {}, 'On this device'), el('th', {}, '')), ...r.keys.map(([k, n]) => el('tr', {}, el('td', {}, k.replace(/^watchlist:/, '')), el('td', {}, kb(n)))),
        el('tr', {}, el('th', {}, 'In the list'), el('th', {}, '')), ...Object.entries(r.parts).map(([k, n]) => el('tr', {}, el('td', {}, k), el('td', {}, kb(n))))),
      el('button', { class: 'btn small', onclick: () => { console.table(r.keys); download(`watch-list-storage-${today()}.json`, JSON.stringify(r, null, 1), 'application/json'); } }, 'Download this report'));
  };
  const details = el('details', { ontoggle: () => { if (details.open) draw(); } }, el('summary', {}, 'Storage on this device'), box);
  return details;
}
export function viewAccount() {
  const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; } });
  const sheetBtn = el('button', { class: 'btn primary', onclick: () => exportToSheet(sheetBtn) }, 'Update Google Sheet');
  const unlinked = state.shows.filter((s) => !s.tmdb).length;
  return el('div', { class: 'account-page' },
    el('section', { class: 'card' }, el('h2', {}, 'Account'), el('div', { id: 'account' })),
    el('section', { class: 'card edit-only' }, el('h2', {}, 'Status options'),
      el('p', { class: 'small' }, 'Add statuses, rename them, pick their colors and set their order.'),
      el('a', { class: 'btn', href: '#/statuses' }, 'Edit status options')),
    el('section', { class: 'card edit-only' }, el('h2', {}, 'TMDB'),
      el('p', { class: 'small' }, `${state.shows.length - unlinked} of ${state.shows.length} titles linked to TMDB (needed for cast and favorite actors).`),
      el('div', { class: 'btn-row' },
        el('a', { class: 'btn', href: '#/link' }, unlinked ? 'Link titles' : 'Review links'),
        el('a', { class: 'btn', href: '#/fill' }, 'Fill from TMDB')),
      el('p', { class: 'muted small' }, 'Fill from TMDB adds Fiction, Tone, Setting and Era (from TMDB and Wikidata), and Country and Language where blank.')),
    el('section', { class: 'card edit-only' }, el('h2', {}, 'Suggestions'),
      el('p', { class: 'small' }, 'Titles you might like, from TMDB’s recommendations for your Top 50 and highest-rated titles, kept apart from your list.'),
      el('a', { class: 'btn', href: '#/suggestions' }, 'Suggestions')),
    el('section', { class: 'card' }, el('h2', {}, 'Where to watch'),
      el('p', { class: 'small' }, `Region: ${regionLabel(watchRegion())}. ${myServices().length ? `Your services: ${myServices().join(', ')}.` : 'No services picked yet.'} `,
        `${state.shows.filter((s) => s.watch).length} titles checked.`),
      el('a', { class: 'btn edit-only', href: '#/watch' }, 'Services and check')),
    el('section', { class: 'card edit-only' }, el('h2', {}, 'Tags'),
      el('p', { class: 'small' }, `${new Set(state.shows.flatMap((s) => s.tags)).size} distinct tags. Merge duplicates, move tags into fields, and review shows one card at a time.`),
      el('div', { class: 'btn-row' }, el('a', { class: 'btn', href: '#/tags' }, 'Tag cleanup'), el('a', { class: 'btn', href: '#/tags/deck' }, 'Tag Deck'), el('a', { class: 'btn', href: '#/tags/mode' }, 'Tag Mode'))),
    el('section', { class: 'card' }, el('h2', {}, 'Export and backup'),
      el('div', { class: 'btn-row' },
        el('span', { class: 'edit-only' }, sheetBtn),
        el('button', { class: 'btn', onclick: () => download(`watch-list-${today()}.csv`, toCsv(exportRows()), 'text/csv') }, 'Download CSV'),
        el('button', { class: 'btn', onclick: () => download(`watch-list-backup-${today()}.json`, JSON.stringify(state, null, 1), 'application/json') }, 'Download backup'),
        el('button', { class: 'btn edit-only', onclick: () => file.click() }, 'Import backup…'), file),
      el('p', { class: 'muted small' }, 'Update Google Sheet overwrites the “Watch list (app)” tab with the current list. Edits made in the sheet don’t come back into the app.')),
    el('section', { class: 'card' }, storageSection()),
    el('p', { class: 'muted small' }, `Version ${APP_VERSION}. Show data and images from TMDB; this app is not endorsed or certified by TMDB. Where to watch data from JustWatch.`));
}
