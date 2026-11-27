// Collections: the strip on the home page, one collection's page (#/collection/:id), the new/edit form,
// and the "Collections" picker on a show page.
import { el, toast, norm } from '../util.js';
import { state, readOnly, canEdit } from '../state.js';
import { catByKey, RANGE, SORTS } from '../categories.js';
import { go, filtersFrom, render } from '../router.js';
import { showCard, showRow, getDensity, statusClass, poster } from '../ui.js';
import { pinTitle } from '../pagetitle.js';
import { collections, collectionById, collectionShows, createCollection, updateCollection, deleteCollection, setMember, hasFilter, collectionsWith, tidy } from '../collections.js';

const href = (c) => `#/collection/${encodeURIComponent(c.id)}`;

// Home page strip: one card per collection, above the browse columns.
export function collectionsStrip() {
  const list = collections();
  if (!list.length && readOnly) return null;
  return el('section', { class: 'card collections-strip' },
    el('h2', {}, 'Collections', readOnly ? null : el('button', { class: 'h2-link linklike', onclick: () => openCollectionForm() }, '+ New')),
    list.length ? el('div', { class: 'collection-cards' }, list.map((c) => {
      const shows = collectionShows(c);
      return el('a', { class: 'collection-card', href: href(c) },
        el('div', { class: 'collection-posters' }, shows.filter((s) => s.tmdb && s.tmdb.poster).slice(0, 4).map((s) => poster(s.tmdb.poster, 'w92', 'mini-poster'))),
        el('b', {}, c.name), el('span', { class: 'muted small' }, ` ${shows.length}`),
        c.description ? el('div', { class: 'muted small clamp' }, c.description) : null);
    })) : el('p', { class: 'muted small' }, 'Group titles your way: “my type of sitcoms”, “favorite crime thrillers”. A collection can follow a filter, hold titles you pick, or both. ',
      'Filter a list and tap ', el('b', {}, 'Save as collection'), ', or start one here.'));
}

// A filter query in words, as chips.
function filterChips(query) {
  const p = new URLSearchParams(query || '');
  const chips = filtersFrom(p).map((f) => el('span', { class: `chip active ${f.not ? 'excluded' : f.cat === 'status' ? statusClass(f.value) : ''}` },
    el('span', { class: 'chip-cat' }, RANGE[f.cat] ? `Year ${RANGE[f.cat].toLowerCase()}:` : `${catByKey[f.cat].label}:`), f.not ? el('span', { class: 'not' }, 'not') : null, f.value));
  if (p.get('q')) chips.push(el('span', { class: 'chip active' }, `“${p.get('q')}”`));
  return chips;
}

export function viewCollection(r) {
  const c = collectionById(r.id);
  if (!c) return el('p', { class: 'muted' }, 'Collection not found. ', el('a', { href: '#/' }, 'Back to browse'));
  if (!readOnly) tidy(c);
  const shows = collectionShows(c);
  const sort = SORTS[r.params.get('sort')] ? r.params.get('sort') : 'title';
  shows.sort(SORTS[sort][1]);
  const h1 = el('h1', {}, c.name);
  const wrap = el('div', { class: 'collection-page' });
  const filtered = hasFilter(c);
  wrap.append(el('div', { class: 'card' }, h1,
    c.description ? el('p', {}, c.description) : null,
    el('p', { class: 'small' }, filtered ? ['Follows: ', ...filterChips(c.query)] : 'Titles picked by hand.',
      (c.pinned || []).length ? el('span', { class: 'muted' }, ` · ${c.pinned.length} added by hand`) : null,
      (c.excluded || []).length ? el('span', { class: 'muted' }, ` · ${c.excluded.length} left out`) : null),
    readOnly ? null : el('div', { class: 'btn-row' },
      el('button', { class: 'btn', onclick: () => openCollectionForm(c) }, 'Edit'),
      filtered ? el('a', { class: 'btn', href: `#/list?${c.query}`, title: 'Open the filter as a list; change it and tap Save as collection to update it' }, 'Open the filter') : null,
      el('button', { class: 'btn danger', onclick: () => {
        if (!confirm(`Delete the collection “${c.name}”? The shows stay on your list.`)) return;
        const i = state.collections.indexOf(c);
        deleteCollection(c); go('#/');
        toast(`Deleted ${c.name}`, { label: 'Undo', run: () => { state.collections.splice(i, 0, c); updateCollection(c, {}); go(href(c)); } });
      } }, 'Delete'))));
  if (!readOnly) wrap.append(addBox(c));
  const sel = el('select', { 'aria-label': 'Sort', onchange: () => go(`${href(c)}${sel.value === 'title' ? '' : `?sort=${sel.value}`}`) },
    Object.entries(SORTS).map(([k, [label]]) => el('option', { value: k, selected: k === sort }, label)));
  wrap.append(el('div', { class: 'filter-bar' }, el('span', { class: 'muted' }, `${shows.length} title${shows.length === 1 ? '' : 's'}`), el('span', { class: 'spacer' }), sel));
  const item = getDensity() === 'rows' ? showRow : showCard;
  wrap.append(el('div', { class: getDensity() === 'rows' ? 'show-rows' : 'show-list' }, shows.map((s) => {
    const node = item(s);
    node.dataset.anchor = s.id;
    if (!readOnly) node.append(el('button', { class: 'btn small ghost collection-remove', title: `Take ${s.title} out of this collection`,
      onclick: (e) => { e.stopPropagation(); setMember(c, s, false); render(); toast(`Took ${s.title} out`, { label: 'Undo', run: () => { setMember(c, s, true); render(); } }); } }, 'Remove'));
    return node;
  })));
  if (!shows.length) wrap.append(el('p', { class: 'muted' }, 'Nothing in it yet.'));
  pinTitle(h1);
  return wrap;
}

// Search your list and add a title by hand.
function addBox(c) {
  const input = el('input', { type: 'search', placeholder: 'Add a title from your list', 'aria-label': 'Add a title', autocomplete: 'off' });
  const out = el('div', { class: 'add-hits' });
  input.addEventListener('input', () => {
    const q = norm(input.value);
    if (q.length < 2) { out.replaceChildren(); return; }
    const inIt = new Set(collectionShows(c).map((s) => s.id));
    const hits = state.shows.filter((s) => !inIt.has(s.id) && norm(s.title).includes(q)).slice(0, 8);
    out.replaceChildren(...hits.map((s) => el('button', { class: 'chip', onclick: () => { setMember(c, s, true); render(); toast(`Added ${s.title}`); } },
      `+ ${s.title}${s.year ? ` (${s.year})` : ''}`)));
    if (!hits.length) out.append(el('span', { class: 'muted small' }, 'No match on your list.'));
  });
  return el('div', { class: 'card' }, input, out);
}

// New or edit. `query`: a list filter to save with a new collection.
export function openCollectionForm(c = null, { query = '' } = {}) {
  if (!canEdit()) return;
  const dlg = el('dialog', { class: 'edit-dialog' });
  const name = el('input', { name: 'name', required: true, value: c ? c.name : '', placeholder: 'My type of sitcoms' });
  const desc = el('textarea', { name: 'description', rows: 3, placeholder: 'What makes a title belong here, in your words' }, c ? c.description : '');
  const q = c ? c.query : query;
  const keep = el('input', { type: 'checkbox', name: 'keep', checked: !!q });
  const form = el('form', { method: 'dialog', class: 'edit-form' },
    el('h2', {}, c ? `Edit ${c.name}` : 'New collection'),
    el('label', { class: 'field' }, 'Name', name),
    el('label', { class: 'field' }, 'Description', desc),
    q ? el('label', { class: 'inline small' }, keep, ' Follow this filter: ', ...filterChips(q)) : el('p', { class: 'muted small' }, 'No filter: add titles by hand on the collection page, or filter a list and tap Save as collection.'),
    el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', value: 'save' }, 'Save'), el('button', { class: 'btn', value: 'cancel', formnovalidate: true }, 'Cancel')));
  dlg.append(form);
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'save' && name.value.trim()) {
      const query = q && keep.checked ? q : '';
      if (c) { updateCollection(c, { name: name.value.trim(), description: desc.value.trim(), query }); toast('Saved'); if (location.hash === href(c)) render(); else go(href(c)); }
      else { const n = createCollection({ name: name.value, description: desc.value.trim(), query }); if (n) go(href(n)); }
    }
    dlg.remove();
  });
  document.body.append(dlg);
  dlg.showModal();
  name.focus();
}

// On a list page: save the current filter as a new collection, or as the filter of an existing one.
export function saveListAsCollection(query) {
  if (!canEdit()) return;
  const list = collections();
  if (!list.length) return openCollectionForm(null, { query });
  const dlg = el('dialog', { class: 'edit-dialog' });
  const pick = el('select', { name: 'which' }, el('option', { value: '' }, 'A new collection'), list.map((c) => el('option', { value: c.id }, `Replace the filter of “${c.name}”`)));
  const form = el('form', { method: 'dialog', class: 'edit-form' }, el('h2', {}, 'Save as collection'), ...filterChips(query),
    el('label', { class: 'field' }, 'Save to', pick),
    el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', value: 'save' }, 'Next'), el('button', { class: 'btn', value: 'cancel', formnovalidate: true }, 'Cancel')));
  dlg.append(form);
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (dlg.returnValue !== 'save') return;
    const c = collectionById(pick.value);
    if (!c) openCollectionForm(null, { query });
    else { updateCollection(c, { query }); toast(`${c.name} now follows this filter`); go(href(c)); }
  });
  document.body.append(dlg);
  dlg.showModal();
}

// Show page: which collections it's in, with a menu to add it to another.
export function collectionsLine(s) {
  const all = collections();
  if (!all.length) return null;
  const box = el('p', { class: 'small collections-line' });
  const draw = () => {
    const mine = collectionsWith(s);
    const others = all.filter((c) => !mine.includes(c));
    box.replaceChildren(el('span', { class: 'muted' }, 'Collections: '),
      ...(mine.length ? mine.flatMap((c, i) => [i ? ', ' : '', el('a', { href: href(c) }, c.name),
        readOnly ? null : el('button', { class: 'linklike x-btn', title: `Take out of ${c.name}`, 'aria-label': `Take out of ${c.name}`, onclick: () => { setMember(c, s, false); draw(); } }, '×')]).filter(Boolean)
        : [el('span', { class: 'muted' }, 'none')]),
      readOnly || !others.length ? '' : el('select', { class: 'mini-select', 'aria-label': 'Add to a collection', onchange: (e) => {
        const c = collectionById(e.target.value); if (c) { setMember(c, s, true); toast(`Added to ${c.name}`); draw(); }
      } }, el('option', { value: '' }, '+ Add to…'), others.map((c) => el('option', { value: c.id }, c.name))));
  };
  draw();
  return box;
}
