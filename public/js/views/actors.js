// One actor's page, and the favorite actors page.
import { el, toast, today } from '../util.js';
import { state, readOnly, save, canEdit, actorByTmdb, listShowFor } from '../state.js';
import { favNamesFor } from '../categories.js';
import { go, listHash } from '../router.js';
import { getPerson } from '../tmdb.js';
import { addFromTmdb } from '../library.js';
import { statusSelect, poster, heartBtn, titleHash } from '../ui.js';

// ---------- Actor page ----------
export function viewActor(r) {
  const pid = Number(r.id);
  const fav = actorByTmdb(pid);
  const wrap = el('div', { class: 'actor-page' });
  const head = el('div', { class: 'show-head' }, poster(fav && fav.profile, 'w342', 'poster big'),
    el('div', { class: 'show-head-body' }, el('h1', {}, fav ? fav.name : 'Loading…')));
  wrap.append(head);
  const body = el('div', {}, el('p', { class: 'muted' }, 'Loading filmography…'));
  wrap.append(body);
  getPerson(pid).then((p) => {
    const a = actorByTmdb(pid);
    if (a && (!a.creditsAt || a.creditsAt < today())) {
      a.credits = p.credits.filter((c) => !c.appearance).map(({ id, type, title, year }) => ({ id, type, title, year }));
      a.creditsAt = today(); a.profile = p.profile || a.profile; save({ quiet: true });
    }
    const note = el('textarea', { rows: 2, placeholder: 'Why you like them', readOnly }, a ? a.note : '');
    note.addEventListener('change', () => { if (!canEdit()) return; const x = actorByTmdb(pid); if (x) { x.note = note.value; save({ quiet: true }); } });
    const countLine = el('p', { class: 'muted' });
    const updateCount = () => { countLine.textContent = `${p.known || 'Actor'} · ${p.credits.filter((c) => listShowFor(c)).length} on your list`; };
    updateCount();
    head.replaceChildren(poster(p.profile, 'w342', 'poster big'), el('div', { class: 'show-head-body' },
      el('div', { class: 'row' }, el('h1', {}, p.name), heartBtn({ id: p.id, name: p.name, profile: p.profile }, a)),
      countLine,
      a ? el('label', { class: 'field wide' }, 'Note', note) : null,
      p.bio ? el('details', {}, el('summary', {}, 'Biography'), el('p', { class: 'small' }, p.bio)) : null));

    let showAll = false;
    let onlyMissing = false;
    let showTv = true;
    let showMovies = true;
    const listBox = el('div', { class: 'credit-list' });
    const controls = el('div', { class: 'row filter-bar' },
      el('label', { class: 'inline' }, el('input', { type: 'checkbox', checked: true, onchange: (e) => { showTv = e.target.checked; fill(); } }), ' TV shows'),
      el('label', { class: 'inline' }, el('input', { type: 'checkbox', checked: true, onchange: (e) => { showMovies = e.target.checked; fill(); } }), ' Movies'),
      el('label', { class: 'inline' }, el('input', { type: 'checkbox', onchange: (e) => { onlyMissing = e.target.checked; fill(); } }), ' Only ones not on my list'),
      el('label', { class: 'inline' }, el('input', { type: 'checkbox', onchange: (e) => { showAll = e.target.checked; fill(); } }), ' Include talk shows and appearances as themself'));
    function fill() {
      const items = p.credits.filter((c) => (showAll || !c.appearance) && (!onlyMissing || !listShowFor(c))
        && (c.type === 'tv' ? showTv : showMovies));
      listBox.replaceChildren(...items.map(creditRow));
      if (!items.length) listBox.append(el('p', { class: 'muted' }, 'Nothing to show.'));
    }
    function creditRow(c) {
      const mine = listShowFor(c);
      const action = mine
        ? statusSelect(mine)
        : readOnly ? null : el('button', { class: 'btn small primary', onclick: async (e) => {
          e.target.disabled = true;
          const s = await addFromTmdb({ id: c.id, type: c.type }, { sources: [`Actor: ${p.name}`] });
          if (s) { toast(`Added ${s.title}`, { label: 'Open', run: () => go(`#/show/${s.id}`) }); fill(); updateCount(); } else e.target.disabled = false;
        } }, '+ Add');
      const href = titleHash(c, `Actor: ${p.name}`);
      return el('div', { class: `credit ${mine ? 'mine' : ''}` }, el('a', { href, 'aria-hidden': 'true', tabindex: '-1' }, poster(c.poster)),
        el('div', { class: 'credit-body' },
          el('div', {}, el('a', { class: 'credit-title', href }, el('b', {}, c.title)), ` ${c.year || ''} · ${c.type === 'tv' ? 'TV' : 'Movie'}`),
          el('div', { class: 'muted small' }, [c.character, c.episodes ? `${c.episodes} ep` : ''].filter(Boolean).join(' · '))),
        action);
    }
    body.replaceChildren(el('h2', {}, 'Filmography'), controls, listBox);
    fill();
  }).catch((e) => body.replaceChildren(el('p', { class: 'muted' }, e.message)));
  return wrap;
}

export function viewActors() {
  const wrap = el('div', { class: 'actors-page' }, el('h1', {}, 'Favorite actors'));
  if (!state.actors.length) {
    wrap.append(el('p', { class: 'muted' }, 'None yet. Open a show, look at its cast, and tap ♡ on the actors you like. Shows need to be linked to TMDB first: ',
      el('a', { href: '#/link' }, 'link your list'), '.'));
    return wrap;
  }
  const actors = [...state.actors].sort((a, b) => a.name.localeCompare(b.name));
  wrap.append(el('div', { class: 'cast-grid' }, actors.map((a) => {
    const n = state.shows.filter((s) => favNamesFor(s).includes(a.name)).length;
    return el('div', { class: 'person' },
      el('a', { href: `#/actor/${a.tmdbId}` }, poster(a.profile, 'w185', 'face')),
      el('div', { class: 'person-body' }, el('a', { class: 'person-name', href: `#/actor/${a.tmdbId}` }, a.name),
        el('div', { class: 'small' }, n ? el('a', { href: listHash([{ cat: 'actor', value: a.name }]) }, `${n} on your list`) : el('span', { class: 'muted' }, 'none on your list')),
        a.note ? el('div', { class: 'muted small' }, a.note) : null));
  })));
  return wrap;
}
