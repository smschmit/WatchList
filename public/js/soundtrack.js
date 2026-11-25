// Official soundtrack on Spotify: find it, pick one, and keep the link on the show (show.soundtrack).
// Two sources, best first:
//   1. Wikidata: the title's "soundtrack release" (P406) items that have a Spotify album ID (P2205). Exact, but only
//      popular titles have it (about 1 in 20 on this list).
//   2. Spotify search through netlify/functions/spotify.mjs: albums and playlists for "<title> soundtrack", ranked by
//      rankCandidates() below. Search results are only suggestions; nothing is saved until you pick one.
// When neither is available, a plain Spotify search link still works for everyone.
import { el, toast, norm } from './util.js';
import { readOnly, save, canEdit } from './state.js';
import { sparql } from './wikidata.js';

// ---------- Pure helpers (no page, no saved state) ----------
// What counts as a soundtrack in a name, and what is almost never the official one.
const SOUNDTRACK_RE = /\b(soundtrack|original score|score from|music from|music of|songs from|ost|original (series|motion picture|television|tv)|official playlist)\b/i;
const BAD_RE = /\b(karaoke|tribute|inspired by|covers?|covered|lullab\w*|piano (versions?|covers?|tribute)|8[- ]bit|music box|ringtones?|workout|unofficial|fan[- ]made|made famous)\b/i;
// Networks and studios that publish official soundtracks and playlists.
const LABELS = ['netflix', 'hbo', 'max', 'apple tv', 'apple original', 'amazon', 'prime video', 'hulu', 'disney', 'marvel', 'lucasfilm',
  'bbc', 'itv', 'channel 4', 'amc', 'fx', 'showtime', 'starz', 'peacock', 'paramount', 'nbc', 'abc', 'cbs', 'fox', 'cw', 'a24',
  'lakeshore', 'watertower', 'milan records', 'sony classical', 'universal', 'warner', 'varese', 'varèse', 'back lot music', 'invada'];

const has = (hay, needle) => needle && ` ${norm(hay)} `.includes(` ${norm(needle)} `);

// A Spotify album or playlist link (open.spotify.com/…, with or without intl-xx, or spotify:album:…) -> { kind, id } or null.
export function parseSpotifyLink(text) {
  const m = /(?:open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?|spotify:)(album|playlist)[/:]([A-Za-z0-9]{22})/i.exec(text || '');
  return m ? { kind: m[1].toLowerCase(), id: m[2] } : null;
}
export const spotifyUrl = (kind, id) => `https://open.spotify.com/${kind}/${id}`;
export const searchUrl = (s) => `https://open.spotify.com/search/${encodeURIComponent(`${s.title} soundtrack`)}`;

// Score one search result for a show, or null if it isn't plausibly that show's soundtrack.
// show: { title, year, endYear, network }. c: an album or playlist from the Spotify function.
export function scoreCandidate(show, c, thisYear = new Date().getFullYear()) {
  const name = c.name || '';
  if (!has(name, show.title)) return null; // must name the show
  const text = `${name} ${c.description || ''}`;
  const by = c.by || '';
  const labelHit = LABELS.some((l) => has(text, l) || has(by, l)) || (show.network && (has(text, show.network) || has(by, show.network)));
  const keyword = SOUNDTRACK_RE.test(name) || (c.kind === 'playlist' && SOUNDTRACK_RE.test(c.description || ''));
  if (!keyword && !(c.kind === 'playlist' && labelHit)) return null;
  if (BAD_RE.test(text)) return null;
  let score = 0;
  const why = [];
  if (keyword) score += 3;
  if (norm(name).startsWith(norm(show.title))) score += 2;
  if (labelHit) { score += 3; why.push('network or label'); }
  if (c.kind === 'album') {
    if (c.albumType === 'compilation' || /various artists/i.test(by)) score += 1;
    if (show.year && c.year) {
      const last = (show.endYear || thisYear) + 1;
      if (c.year >= show.year - 1 && c.year <= last) { score += 2; why.push('year fits'); } else score -= 3;
    }
  } else {
    if (/\bofficial\b/i.test(text)) { score += 2; why.push('says official'); }
    if (!labelHit && c.ownerId !== 'spotify') score -= 2; // someone's personal playlist
  }
  return { ...c, score, likelyOfficial: labelHit && keyword, why };
}
// Best first, duplicates (same Spotify id) dropped, at most `max`.
export function rankCandidates(show, list, max = 6, thisYear) {
  const seen = new Set();
  return list.map((c) => scoreCandidate(show, c, thisYear)).filter(Boolean)
    .filter((c) => (seen.has(c.id) ? false : seen.add(c.id)))
    .filter((c) => c.score >= 3)
    .sort((a, b) => b.score - a.score || (b.year || 0) - (a.year || 0))
    .slice(0, max);
}

// ---------- Lookups ----------
// Wikidata soundtrack albums with a Spotify ID, for a TMDB-linked show. fetchImpl is injectable for tests.
export async function wikidataSoundtracks(t, fetchImpl) {
  if (!t || !t.id || !/^(tv|movie)$/.test(t.type)) return [];
  const prop = t.type === 'tv' ? 'P4983' : 'P4947';
  const rows = await sparql(`SELECT ?st ?label ?sp ?date WHERE {
    ?item wdt:${prop} "${String(t.id).replace(/\D/g, '')}" ; wdt:P406 ?st .
    ?st wdt:P2205 ?sp .
    OPTIONAL { ?st rdfs:label ?label FILTER(lang(?label) = "en") }
    OPTIONAL { ?st wdt:P577 ?date }
  }`, fetchImpl);
  const seen = new Set();
  return rows.filter((r) => /^[A-Za-z0-9]{22}$/.test(r.sp) && !seen.has(r.sp) && seen.add(r.sp)).map((r) => ({
    kind: 'album', id: r.sp, name: r.label || 'Soundtrack album', url: spotifyUrl('album', r.sp), image: null, by: '',
    year: Number((r.date || '').slice(0, 4)) || null, source: 'wikidata', likelyOfficial: true, why: ['listed on Wikidata'],
  })).sort((a, b) => (a.year || 0) - (b.year || 0));
}

async function fn(params) {
  if (window.spotifyMock) return window.spotifyMock(params); // used by local tests
  const token = window.cloud && window.cloud.token && await window.cloud.token();
  if (!token) throw new Error('Sign in to search Spotify.');
  const res = await fetch(`/.netlify/functions/spotify?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(body.error || `Spotify lookup failed (${res.status})`); err.status = res.status; throw err; }
  return body;
}
export async function spotifySearch(show) {
  const queries = [`${show.title} soundtrack`, `${show.title} music from the series`];
  if (/movie|film/i.test(show.format || '')) queries[1] = `${show.title} original motion picture`;
  const results = await Promise.all(queries.map((q) => fn({ q })));
  return rankCandidates(show, results.flatMap((d) => [...(d.albums || []), ...(d.playlists || [])]).map((c) => ({ ...c, source: 'spotify' })));
}
// Everything we can find, best first. notes: problems worth showing (for example, Spotify search not set up).
export async function findSoundtracks(show) {
  const notes = [];
  const [wd, sp] = await Promise.all([
    show.tmdb && show.tmdb.id ? wikidataSoundtracks(show.tmdb).catch((e) => { notes.push(e.message); return []; }) : [],
    spotifySearch(show).catch((e) => { notes.push(e.status === 501 ? 'Spotify search isn’t set up yet (see README → Spotify).' : e.message); return []; }),
  ]);
  const ids = new Set(wd.map((c) => c.id));
  // A Wikidata album that search also found gets search's cover art.
  for (const c of wd) { const hit = sp.find((x) => x.id === c.id); if (hit) Object.assign(c, { image: hit.image, by: hit.by }); }
  return { list: [...wd, ...sp.filter((c) => !ids.has(c.id))], notes };
}
// The name and art for a pasted link; falls back to a plain label when the lookup isn't available.
export async function itemForLink(link) {
  try { const { item } = await fn({ kind: link.kind, id: link.id }); if (item) return { ...item, source: 'manual' }; } catch {}
  return { kind: link.kind, id: link.id, name: link.kind === 'album' ? 'Spotify album' : 'Spotify playlist', url: spotifyUrl(link.kind, link.id), image: null, by: '', source: 'manual' };
}
// What is kept on the show.
export const toSaved = (c) => ({ kind: c.kind, id: c.id, name: c.name, url: c.url || spotifyUrl(c.kind, c.id), image: c.image || null,
  by: c.by || '', year: c.year || null, source: c.source || 'manual', savedAt: new Date().toISOString().slice(0, 10) });

// ---------- Show page section ----------
export function soundtrackSection(s) {
  const sec = el('section', { class: 'card soundtrack' });
  const draw = () => {
    sec.replaceChildren(el('h2', {}, 'Soundtrack'));
    const st = s.soundtrack;
    if (st) {
      sec.append(itemRow(st, el('a', { class: 'btn primary small', href: st.url, target: '_blank', rel: 'noopener' }, 'Open in Spotify')));
      if (!readOnly) sec.append(el('div', { class: 'btn-row' },
        el('button', { class: 'btn small', onclick: () => finder() }, 'Change'),
        el('button', { class: 'btn small ghost', onclick: () => {
          if (!canEdit()) return;
          const old = s.soundtrack; s.soundtrack = null; save({ quiet: true }); draw();
          toast('Soundtrack link removed', { label: 'Undo', run: () => { s.soundtrack = old; save({ quiet: true }); draw(); } });
        } }, 'Remove')));
      return;
    }
    if (readOnly) { sec.append(el('a', { class: 'btn small', href: searchUrl(s), target: '_blank', rel: 'noopener' }, 'Search Spotify ↗')); return; }
    sec.append(el('div', { class: 'btn-row' },
      el('button', { class: 'btn small primary', onclick: () => finder() }, 'Find the official soundtrack'),
      el('a', { class: 'btn small ghost', href: searchUrl(s), target: '_blank', rel: 'noopener' }, 'Search Spotify ↗')));
  };
  const pick = (c) => {
    if (!canEdit()) return;
    s.soundtrack = toSaved(c);
    save({ quiet: true });
    draw();
    toast(`Saved: ${c.name}`);
  };
  const finder = async () => {
    if (!canEdit()) return;
    const box = el('div', { class: 'soundtrack-finder' }, el('p', { class: 'muted small' }, 'Looking on Wikidata and Spotify…'));
    sec.replaceChildren(el('h2', {}, 'Soundtrack'), box);
    const paste = el('input', { type: 'url', placeholder: 'Or paste a Spotify album or playlist link', 'aria-label': 'Spotify link' });
    const pasteForm = el('form', { class: 'row', onsubmit: async (e) => {
      e.preventDefault();
      const link = parseSpotifyLink(paste.value);
      if (!link) { toast('That isn’t a Spotify album or playlist link.'); return; }
      pick(await itemForLink(link));
    } }, paste, el('button', { class: 'btn small' }, 'Use link'));
    const foot = el('div', { class: 'btn-row' },
      el('a', { class: 'btn small ghost', href: searchUrl(s), target: '_blank', rel: 'noopener' }, 'Search Spotify ↗'),
      el('button', { class: 'btn small ghost', onclick: draw }, 'Cancel'));
    const { list, notes } = await findSoundtracks(s);
    box.replaceChildren(...[
      list.length ? el('p', { class: 'muted small' }, 'Pick the one to keep. Tap a name to check it in Spotify first.')
        : el('p', { class: 'muted small' }, 'Nothing that looks like this title’s soundtrack. Try Spotify search, then paste the link here.'),
      list.length ? el('ul', { class: 'soundtrack-list' }, list.map((c) => el('li', {},
        itemRow(c, el('button', { class: 'btn small primary', onclick: () => pick(c) }, 'Use this'))))) : null,
      notes.length ? el('p', { class: 'small muted' }, notes.join(' ')) : null,
      pasteForm, foot].filter(Boolean)); // replaceChildren would print null as text
  };
  draw();
  return sec;
}
function itemRow(c, action) {
  const meta = [c.kind === 'album' ? 'Album' : 'Playlist', c.by, c.year, c.tracks ? `${c.tracks} tracks` : ''].filter(Boolean).join(' · ');
  return el('div', { class: 'soundtrack-item' },
    c.image ? el('img', { src: c.image, alt: '', loading: 'lazy' }) : el('div', { class: 'soundtrack-art', 'aria-hidden': 'true' }, '♪'),
    el('div', { class: 'soundtrack-body' },
      el('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.name),
      el('div', { class: 'small muted' }, meta,
        c.likelyOfficial ? el('span', { class: 'pill', title: (c.why || []).join(', ') }, c.source === 'wikidata' ? 'Wikidata' : 'Likely official') : null)),
    action);
}
