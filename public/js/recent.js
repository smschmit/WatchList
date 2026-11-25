// Recently viewed: shows, TMDB titles and actors you opened, newest first.
// Kept on this device only (not in the synced list), so opening a page never triggers a cloud sync,
// and read-only viewers get a history too. Cleared on sign-out (cloud.js).
import { showById, listShowFor } from './state.js';

export const RECENT_KEY = 'watchlist:recent';
const MAX = 30;

export function loadRecent() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* per-device nicety only */ }
}

// entry: { kind: 'show', id } | { kind: 'title', type, id, name, year, poster } | { kind: 'actor', id, name, profile }
const keyOf = (e) => (e.kind === 'title' ? `title:${e.type}-${e.id}` : `${e.kind}:${e.id}`);
export function recordView(entry) {
  const key = keyOf(entry);
  const list = loadRecent();
  // Pages re-render after every edit; skip the write when nothing would change.
  if (list[0] && list[0].key === key && JSON.stringify({ ...list[0], at: 0 }) === JSON.stringify({ key, ...entry, at: 0 })) return;
  saveRecent([{ key, ...entry, at: Date.now() }, ...list.filter((e) => e.key !== key)].slice(0, MAX));
}

// Entries as they should be shown now: shows read from the list (so renames show and deleted shows drop out),
// and a title you've since added turns into that show, without duplicates.
export function recentItems() {
  const out = [], seen = new Set();
  for (const e of loadRecent()) {
    let item = null;
    if (e.kind === 'show') { const s = showById(e.id); if (s) item = { kind: 'show', show: s }; }
    else if (e.kind === 'title') { const s = listShowFor(e); item = s ? { kind: 'show', show: s } : { ...e }; }
    else if (e.kind === 'actor') item = { ...e };
    if (!item) continue;
    const k = item.kind === 'show' ? `show:${item.show.id}` : e.key;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
