// Account, backup, import and export.
import { el, toast, download, today } from '../util.js';
import { state, setState, normalizeState, save, canEdit } from '../state.js';
import { totalHours, fieldOf } from '../shows.js';
import { favNamesFor, SORTS } from '../categories.js';
import { render } from '../router.js';
import { APP_VERSION } from '../version.js';

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
    el('section', { class: 'card edit-only' }, el('h2', {}, 'Tags'),
      el('p', { class: 'small' }, `${new Set(state.shows.flatMap((s) => s.tags)).size} distinct tags. Merge duplicates, move tags into fields, and review shows one card at a time.`),
      el('div', { class: 'btn-row' }, el('a', { class: 'btn', href: '#/tags' }, 'Tag cleanup'), el('a', { class: 'btn', href: '#/tags/deck' }, 'Tag Deck'))),
    el('section', { class: 'card' }, el('h2', {}, 'Export and backup'),
      el('div', { class: 'btn-row' },
        el('span', { class: 'edit-only' }, sheetBtn),
        el('button', { class: 'btn', onclick: () => download(`watch-list-${today()}.csv`, toCsv(exportRows()), 'text/csv') }, 'Download CSV'),
        el('button', { class: 'btn', onclick: () => download(`watch-list-backup-${today()}.json`, JSON.stringify(state, null, 1), 'application/json') }, 'Download backup'),
        el('button', { class: 'btn edit-only', onclick: () => file.click() }, 'Import backup…'), file),
      el('p', { class: 'muted small' }, 'Update Google Sheet overwrites the “Watch list (app)” tab with the current list. Edits made in the sheet don’t come back into the app.')),
    el('p', { class: 'muted small' }, `Version ${APP_VERSION}. Show data and images from TMDB; this app is not endorsed or certified by TMDB.`));
}
