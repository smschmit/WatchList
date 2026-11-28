// A TMDB title that may not be on the list yet.
import { el, toast } from '../util.js';
import { readOnly, normShow, listShowFor } from '../state.js';
import { go, syncLastHash, render } from '../router.js';
import { getDetails, detailsToShow } from '../tmdb.js';
import { addFromTmdb, possibleMatch, linkAndFill } from '../library.js';
import { describeNext } from '../facts.js';
import { poster, metaLine, castGrid, favLine } from '../ui.js';
import { backdropCard } from '../images.js';
import { whereToWatch } from '../watch.js';
import { recordView } from '../recent.js';
import { pinTitle } from '../pagetitle.js';

// ---------- Title page (a TMDB title that may not be on the list yet) ----------
export function viewTitle(r) {
  const m = /^(tv|movie)-(\d+)$/.exec(r.id || '');
  if (!m) return el('p', { class: 'muted' }, 'Title not found. ', el('a', { href: '#/' }, 'Back to browse'));
  const t = { type: m[1], id: Number(m[2]) };
  const mine = listShowFor(t);
  if (mine) { const here = location.hash; setTimeout(() => { if (location.hash === here) go(`#/show/${encodeURIComponent(mine.id)}`); }); return el('div'); }
  const src = r.params.get('src');
  const here = location.hash;
  const wrap = el('div', { class: 'show-page' });
  const head = el('div', { class: 'show-head' }, poster(null, 'w342', 'poster big'),
    el('div', { class: 'show-head-body' }, el('h1', {}, 'Loading…')));
  wrap.append(head, backdropCard(t));
  getDetails(t).then(async (d) => {
    const info = normShow(await detailsToShow(t, d));
    if (location.hash === here) recordView({ kind: 'title', type: t.type, id: t.id, name: info.title, year: info.year, poster: d.poster_path || null });
    const addBtn = readOnly ? null : el('button', { class: 'btn primary', onclick: async () => {
      addBtn.disabled = true;
      const s = await addFromTmdb(t, src ? { sources: [src] } : {});
      if (s) { toast(`Added ${s.title}`); history.replaceState(history.state, '', `#/show/${encodeURIComponent(s.id)}`); syncLastHash(); render(); }
      else addBtn.disabled = false;
    } }, '+ Add to my list');
    // An unlinked show with the same title and year is probably this one: offer to link it instead of adding a copy.
    const match = readOnly ? null : possibleMatch({ ...t, title: info.title, original: d.original_name || d.original_title, year: info.year });
    let matchNote = null;
    if (match) {
      addBtn.textContent = 'Add anyway';
      addBtn.classList.remove('primary');
      const href = `#/show/${encodeURIComponent(match.id)}`;
      matchNote = el('p', { class: 'small maybe' }, 'Might already be on your list as ',
        el('a', { href }, `${match.title}${match.year ? ` (${match.year})` : ''}`), '. ',
        el('button', { class: 'btn small primary', onclick: async (e) => {
          e.currentTarget.disabled = true;
          const here = location.hash;
          await linkAndFill(match, { ...t, title: info.title, year: info.year, poster: d.poster_path });
          if (location.hash === here) go(href); // linking re-renders this page, which may already have moved on to the show
        } }, 'Link it to this title'));
    }
    head.replaceChildren(poster(d.poster_path, 'w342', 'poster big'), el('div', { class: 'show-head-body' },
      el('h1', {}, info.title),
      el('p', { class: 'muted' }, metaLine(info)),
      favLine(t, { cls: '' }),
      info.facts || info.country ? el('p', { class: 'small' },
        [info.facts && `TMDB: ${[info.facts.status, describeNext(info.facts)].filter(Boolean).join(', ')}`, [info.country, info.languages.join(', ')].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')) : null,
      info.genres.length ? el('p', { class: 'small' }, info.genres.join(' · ')) : null,
      whereToWatch(t),
      d.tagline ? el('p', { class: 'small muted' }, el('i', {}, d.tagline)) : null,
      d.overview ? el('p', {}, d.overview) : null,
      matchNote || el('p', { class: 'muted small' }, 'Not on your list yet.'),
      el('div', { class: 'btn-row' }, addBtn,
        el('a', { class: 'btn ghost', href: `https://www.themoviedb.org/${t.type}/${t.id}`, target: '_blank', rel: 'noopener' }, 'View on TMDB'))));
    if (location.hash === here) pinTitle(head.querySelector('h1'));
  }).catch((e) => head.replaceChildren(el('p', { class: 'muted' }, e.message)));
  const sec = el('section', { class: 'card cast' }, el('h2', {}, 'Cast'));
  castGrid(sec, t);
  wrap.append(sec);
  return wrap;
}
