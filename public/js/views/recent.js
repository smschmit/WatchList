// Recently viewed shows, titles and actors (see recent.js).
import { el, toast } from '../util.js';
import { actorByTmdb } from '../state.js';
import { render } from '../router.js';
import { showCard, poster, cardClick } from '../ui.js';
import { recentItems, loadRecent, saveRecent } from '../recent.js';

function titleCard(t) {
  const href = `#/title/${t.type}-${t.id}`;
  return el('div', { class: 'show-card', onclick: cardClick(href) },
    poster(t.poster),
    el('div', { class: 'show-card-body' },
      el('div', { class: 'show-card-title' }, el('a', { href }, t.name || 'Untitled')),
      el('div', { class: 'muted small' }, [t.year, t.type === 'tv' ? 'TV' : 'Movie', 'Not on your list'].filter(Boolean).join(' · '))));
}
function actorCard(a) {
  const href = `#/actor/${a.id}`;
  const fav = actorByTmdb(a.id);
  return el('div', { class: 'show-card', onclick: cardClick(href) },
    poster((fav && fav.profile) || a.profile, 'w185', 'face'),
    el('div', { class: 'show-card-body' },
      el('div', { class: 'show-card-title' }, el('a', { href }, (fav && fav.name) || a.name || 'Unknown')),
      el('div', { class: 'muted small' }, fav ? 'Actor · ♥ favorite' : 'Actor')));
}

export function viewRecent() {
  const items = recentItems();
  const wrap = el('div', { class: 'recent-page' });
  const clear = items.length ? el('button', { class: 'btn small', onclick: () => {
    const snap = loadRecent();
    saveRecent([]);
    render();
    toast('Recently viewed cleared', { label: 'Undo', run: () => { saveRecent(snap); render(); } });
  } }, 'Clear') : null;
  wrap.append(el('div', { class: 'row' }, el('h1', {}, 'Recently viewed'), clear));
  if (!items.length) {
    wrap.append(el('p', { class: 'muted' }, 'Shows, titles and actors you open show up here, newest first. Kept on this device only.'));
    return wrap;
  }
  wrap.append(el('div', { class: 'show-list' }, items.map((i) =>
    i.kind === 'show' ? showCard(i.show) : i.kind === 'title' ? titleCard(i) : actorCard(i))));
  return wrap;
}
