// The watch list itself: loading, normalizing, saving, and looking things up.
// Data lives on the device first (localStorage) and syncs to Supabase when signed in (cloud.js).
import { arr, toNum, newId, toast } from './util.js';

export const STATE_KEY = 'watchlist:state';

export let state; // set by main.js at startup
export let readOnly = false;
// Other modules read `state` and `readOnly` directly (live bindings) and change them only through these.
export function setState(s) { state = s; }
export function setReadOnly(v) { readOnly = v; }
let renderer = () => {};
export function setRenderer(fn) { renderer = fn; }

// ---------- State ----------
export function normShow(s) {
  return {
    id: s.id || newId('s'),
    title: s.title || 'Untitled',
    format: s.format || '',
    year: toNum(s.year), endYear: toNum(s.endYear),
    seasons: toNum(s.seasons), episodes: toNum(s.episodes), epLength: toNum(s.epLength),
    showStatus: s.showStatus || '',
    genres: arr(s.genres), structure: s.structure || '',
    country: s.country || '', languages: arr(s.languages), tags: arr(s.tags),
    network: s.network || '', confidence: s.confidence || '', researchNotes: s.researchNotes || '',
    status: s.status || '', want: s.want || '', recommend: s.recommend || '',
    sources: arr(s.sources), notes: s.notes || '', rating: toNum(s.rating),
    tmdb: s.tmdb || null,
    facts: s.facts || null, // what TMDB said at the last check (see facts.js); never edited by hand
    factsAck: s.factsAck || '', // the facts you dismissed on the Updates page
    // Your own values for the fields filled from TMDB/Wikidata. null = not set, so the sourced value shows (see fieldOf in shows.js);
    // '' or [] = you cleared it on purpose.
    fiction: ownStr(s.fiction), tone: ownStr(s.tone), setting: ownList(s.setting), era: ownList(s.era),
    sourced: s.sourced || null, // what TMDB and Wikidata said at the last fill (sources.js); never edited by hand
    tagsReviewedAt: s.tagsReviewedAt || null, // last time you saved this show in the Tag Deck
    ...pickExtra(s, SHOW_KEYS),
  };
}
export const SHOW_KEYS = ['id', 'title', 'format', 'year', 'endYear', 'seasons', 'episodes', 'epLength', 'showStatus', 'genres',
  'structure', 'country', 'languages', 'tags', 'network', 'confidence', 'researchNotes', 'status', 'want', 'recommend',
  'sources', 'notes', 'rating', 'tmdb', 'facts', 'factsAck', 'fiction', 'tone', 'setting', 'era', 'sourced', 'tagsReviewedAt'];
const ownStr = (v) => (v == null ? null : String(v));
const ownList = (v) => (v == null ? null : arr(v));
export function normActor(a) {
  return { id: a.id || `p${a.tmdbId}`, tmdbId: a.tmdbId, name: a.name || '', profile: a.profile || null,
    note: a.note || '', credits: arr(a.credits), creditsAt: a.creditsAt || null, ...pickExtra(a, ['id', 'tmdbId', 'name', 'profile', 'note', 'credits', 'creditsAt']) };
}
// Keep fields a newer version added, so an older copy of the app doesn't drop them.
export function pickExtra(o, known) {
  const out = {};
  for (const k of Object.keys(o || {})) if (!known.includes(k)) out[k] = o[k];
  return out;
}
export function normalizeState(s) {
  s = s || {};
  return { ...s, version: 1, shows: arr(s.shows).map(normShow), actors: arr(s.actors).map(normActor) };
}
export function loadState() {
  try { return normalizeState(JSON.parse(localStorage.getItem(STATE_KEY) || 'null')); } catch { return normalizeState(null); }
}
export function writeLocal() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { toast('Could not save on this device: storage is full.'); }
}
export function save({ quiet = false } = {}) {
  writeLocal();
  if (window.cloud) window.cloud.onLocalSave();
  if (!quiet) renderer();
}
export function canEdit() {
  if (readOnly) { toast('View only.'); return false; }
  return true;
}

export const showById = (id) => state.shows.find((s) => s.id === id);
export const actorByTmdb = (tid) => state.actors.find((a) => a.tmdbId === tid);

export function listShowFor(c) {
  return state.shows.find((s) => s.tmdb && s.tmdb.id === c.id && s.tmdb.type === c.type);
}
