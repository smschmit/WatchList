// A TMDB title that may not be on the list yet.
import { el, toast } from '../util.js';
import { readOnly, normShow, listShowFor } from '../state.js';
import { go, syncLastHash, render } from '../router.js';
import { getCast, getDetails, detailsToShow } from '../tmdb.js';
import { addFromTmdb } from '../library.js';
import { poster, metaLine, personTile } from '../ui.js';

// ---------- Title page (a TMDB title that may not be on the list yet) ----------
export function viewTitle(r) {
  const m = /^(tv|movie)-(\d+)$/.exec(r.id || '');
  if (!m) return el('p', { class: 'muted' }, 'Title not found. ', el('a', { href: '#/' }, 'Back to browse'));
  const t = { type: m[1], id: Number(m[2]) };
  const mine = listShowFor(t);
  if (mine) { setTimeout(() => go(`#/show/${encodeURIComponent(mine.id)}`)); return el('div'); }
  const src = r.params.get('src');
  const wrap = el('div', { class: 'show-page' });
  const head = el('div', { class: 'show-head' }, poster(null, 'w342', 'poster big'),
    el('div', { class: 'show-head-body' }, el('h1', {}, 'Loading…')));
  wrap.append(head);
  getDetails(t).then(async (d) => {
    const info = normShow(await detailsToShow(t, d));
    const addBtn = readOnly ? null : el('button', { class: 'btn primary', onclick: async () => {
      addBtn.disabled = true;
      const s = await addFromTmdb(t, src ? { sources: [src] } : {});
      if (s) { toast(`Added ${s.title}`); history.replaceState(null, '', `#/show/${encodeURIComponent(s.id)}`); syncLastHash(); render(); }
      else addBtn.disabled = false;
    } }, '+ Add to my list');
    head.replaceChildren(poster(d.poster_path, 'w342', 'poster big'), el('div', { class: 'show-head-body' },
      el('h1', {}, info.title),
      el('p', { class: 'muted' }, metaLine(info)),
      info.showStatus || info.country ? el('p', { class: 'small' },
        [info.showStatus && `Show status: ${info.showStatus}`, [info.country, info.languages.join(', ')].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')) : null,
      info.genres.length ? el('p', { class: 'small' }, info.genres.join(' · ')) : null,
      d.tagline ? el('p', { class: 'small muted' }, el('i', {}, d.tagline)) : null,
      d.overview ? el('p', {}, d.overview) : null,
      el('p', { class: 'muted small' }, 'Not on your list yet.'),
      el('div', { class: 'btn-row' }, addBtn,
        el('a', { class: 'btn ghost', href: `https://www.themoviedb.org/${t.type}/${t.id}`, target: '_blank', rel: 'noopener' }, 'View on TMDB'))));
  }).catch((e) => head.replaceChildren(el('p', { class: 'muted' }, e.message)));
  const sec = el('section', { class: 'card cast' }, el('h2', {}, 'Cast'));
  const grid = el('div', { class: 'cast-grid' }, el('p', { class: 'muted' }, 'Loading cast…'));
  sec.append(grid);
  getCast(t).then((cast) => {
    grid.replaceChildren(...cast.map((c) => personTile(c, c.character + (c.episodes ? ` · ${c.episodes} ep` : ''))));
    if (!cast.length) grid.append(el('p', { class: 'muted' }, 'No cast listed on TMDB.'));
  }).catch((e) => grid.replaceChildren(el('p', { class: 'muted' }, e.message)));
  wrap.append(sec);
  return wrap;
}
