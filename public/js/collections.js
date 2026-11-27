// Collections ("my type of sitcoms"): a name, a plain-language description, an optional saved filter (the same
// query a filtered list link uses), and titles pinned in or left out by hand. Kept in state.collections, a list of
// items with ids, so sync merges them one collection at a time.
import { newId, today, uniq } from './util.js';
import { state, save, canEdit, showById } from './state.js';
import { applyFilters } from './categories.js';
import { filtersFrom } from './router.js';

export const collections = () => (Array.isArray(state.collections) ? state.collections : []);
export const collectionById = (id) => collections().find((c) => c.id === id);
const params = (c) => new URLSearchParams(c.query || '');

// The shows in a collection: what the saved filter finds, plus pinned ones, minus ones left out.
export function collectionShows(c) {
  const p = params(c);
  const filters = filtersFrom(p);
  const q = p.get('q') || '';
  const found = filters.length || q ? applyFilters(state.shows, filters, q) : [];
  const out = new Set(found.map((s) => s.id));
  for (const id of c.pinned || []) out.add(id);
  for (const id of c.excluded || []) out.delete(id);
  return state.shows.filter((s) => out.has(s.id));
}
export const inCollection = (c, s) => collectionShows(c).includes(s);
export const hasFilter = (c) => { const p = params(c); return filtersFrom(p).length > 0 || !!p.get('q'); };
export const collectionsWith = (s) => collections().filter((c) => inCollection(c, s));

export function createCollection({ name, description = '', query = '', pinned = [] }) {
  if (!canEdit()) return null;
  if (!Array.isArray(state.collections)) state.collections = [];
  const c = { id: newId('c'), name: name.trim() || 'Untitled collection', description, query, pinned, excluded: [], createdAt: today() };
  state.collections.push(c);
  save({ quiet: true });
  return c;
}
export function updateCollection(c, patch) {
  if (!canEdit()) return;
  Object.assign(c, patch);
  save({ quiet: true });
}
export function deleteCollection(c) {
  if (!canEdit()) return;
  state.collections = collections().filter((x) => x !== c);
  save({ quiet: true });
}
// Put a show in (pin, and undo a leave-out) or take it out (leave it out if the filter finds it, else unpin).
export function setMember(c, s, on) {
  if (!canEdit()) return;
  c.pinned = (c.pinned || []).filter((id) => id !== s.id);
  c.excluded = (c.excluded || []).filter((id) => id !== s.id);
  if (on) { if (!inCollection(c, s)) c.pinned = uniq([...c.pinned, s.id]); }
  else if (inCollection(c, s)) c.excluded = uniq([...c.excluded, s.id]);
  save({ quiet: true });
}
// Drop ids of shows that no longer exist (deleted), so the lists don't grow forever.
export function tidy(c) {
  const ok = (id) => !!showById(id);
  c.pinned = (c.pinned || []).filter(ok);
  c.excluded = (c.excluded || []).filter(ok);
}
