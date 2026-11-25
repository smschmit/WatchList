// One actor's page, and the favorite actors page.
import { el, toast, today } from '../util.js';
import { state, readOnly, save, canEdit, actorByTmdb, listShowFor } from '../state.js';
import { favNamesFor } from '../categories.js';
import { go, listHash, recall, remember, restoreScroll } from '../router.js';
import { getPerson, roleTier, isMajorRole, knownScore } from '../tmdb.js';
import { addFromTmdb } from '../library.js';
import { recordView } from '../recent.js';
import { pinTitle } from '../pagetitle.js';
import { statusSelect, poster, heartBtn, titleHash, cardClick, favLine } from '../ui.js';

// ---------- Actor page ----------
export function viewActor(r) {
  const pid = Number(r.id);
  const fav = actorByTmdb(pid);
  const here = location.hash;
  const wrap = el('div', { class: 'actor-page' });
  const head = el('div', { class: 'show-head' }, poster(fav && fav.profile, 'w342', 'poster big'),
    el('div', { class: 'show-head-body' }, el('h1', {}, fav ? fav.name : 'Loading…')));
  wrap.append(head);
  if (fav) pinTitle(head.querySelector('h1'));
  const body = el('div', {}, el('p', { class: 'muted' }, 'Loading filmography…'));
  wrap.append(body);
  getPerson(pid).then((p) => {
    const a = actorByTmdb(pid);
    if (location.hash === here) recordView({ kind: 'actor', id: pid, name: p.name, profile: p.profile || null });
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
    if (location.hash === here) pinTitle(head.querySelector('h1'));

    // Remembered per page so Back brings the list back filtered the same way, at the same length.
    let showAll = recall('showAll', false);
    let onlyMissing = recall('onlyMissing', false);
    let showTv = recall('showTv', true);
    let showMovies = recall('showMovies', true);
    let onlyMajor = recall('onlyMajor', false);
    let sortBy = recall('sortBy', 'newest');
    const listBox = el('div', { class: 'credit-list' });
    const sortSelect = el('select', { 'aria-label': 'Sort filmography', onchange: (e) => { sortBy = e.target.value; remember('sortBy', sortBy); fill(); } },
      el('option', { value: 'newest', selected: sortBy === 'newest' }, 'Newest'),
      el('option', { value: 'known', selected: sortBy === 'known' }, 'Known for'));
    const controls = el('div', { class: 'row filter-bar' },
      sortSelect,
      el('label', { class: 'inline', title: 'TV shows with 2 or more episodes, and movies where they were billed in the top 8' },
        el('input', { type: 'checkbox', checked: onlyMajor, onchange: (e) => { onlyMajor = e.target.checked; remember('onlyMajor', onlyMajor); fill(); } }), ' Major roles only'),
      el('label', { class: 'inline' }, el('input', { type: 'checkbox', checked: showTv, onchange: (e) => { showTv = e.target.checked; remember('showTv', showTv); fill(); } }), ' TV shows'),
      el('label', { class: 'inline' }, el('input', { type: 'checkbox', checked: showMovies, onchange: (e) => { showMovies = e.target.checked; remember('showMovies', showMovies); fill(); } }), ' Movies'),
      el('label', { class: 'inline' }, el('input', { type: 'checkbox', checked: onlyMissing, onchange: (e) => { onlyMissing = e.target.checked; remember('onlyMissing', onlyMissing); fill(); } }), ' Only ones not on my list'),
      el('label', { class: 'inline' }, el('input', { type: 'checkbox', checked: showAll, onchange: (e) => { showAll = e.target.checked; remember('showAll', showAll); fill(); } }), ' Include talk shows and appearances as themself'));
    function fill() {
      const items = p.credits.filter((c) => (showAll || !c.appearance) && (!onlyMissing || !listShowFor(c))
        && (c.type === 'tv' ? showTv : showMovies) && (!onlyMajor || isMajorRole(c)));
      // credits arrive newest first; ties in the Known for score keep that order.
      if (sortBy === 'known') items.sort((a, b) => knownScore(b) - knownScore(a));
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
      return el('div', { class: `credit clickable ${mine ? 'mine' : ''}`, onclick: cardClick(href) }, el('a', { href, 'aria-hidden': 'true', tabindex: '-1' }, poster(c.poster)),
        el('div', { class: 'credit-body' },
          el('div', {}, el('a', { class: 'credit-title', href }, el('b', {}, c.title)), ` ${c.year || ''} · ${c.type === 'tv' ? 'TV' : 'Movie'}`),
          el('div', { class: 'muted small' }, roleTier(c) ? el('span', { class: `role-tag role-${roleTier(c) === 'Guest' || roleTier(c) === 'Small role' ? 'minor' : 'major'}` }, roleTier(c)) : null,
            [c.character, c.episodes ? `${c.episodes} ep` : ''].filter(Boolean).join(' · ')),
          favLine(c, { skip: p.name })),
        action);
    }
    body.replaceChildren(el('h2', {}, 'Filmography'), controls, listBox);
    fill();
    restoreScroll();
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
    return el('div', { class: 'person clickable', onclick: cardClick(`#/actor/${a.tmdbId}`) },
      el('a', { href: `#/actor/${a.tmdbId}` }, poster(a.profile, 'w185', 'face')),
      el('div', { class: 'person-body' }, el('a', { class: 'person-name', href: `#/actor/${a.tmdbId}` }, a.name),
        el('div', { class: 'small' }, n ? el('a', { href: listHash([{ cat: 'actor', value: a.name }]) }, `${n} on your list`) : el('span', { class: 'muted' }, 'none on your list')),
        a.note ? el('div', { class: 'muted small' }, a.note) : null));
  })));
  return wrap;
}
