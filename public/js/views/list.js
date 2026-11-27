// Filtered, sorted list of shows.
import { el, norm } from '../util.js';
import { totalHours, fmtHours } from '../shows.js';
import { state, readOnly } from '../state.js';
import { CATS, catByKey, RANGE, counts, SORTS, applyFilters } from '../categories.js';
import { go, listHash, filtersFrom, render } from '../router.js';
import { emptyState, statusClass, showCard, showRow, getDensity, setDensity } from '../ui.js';
import { saveListAsCollection } from './collections.js';

export function viewList(r) {
  if (!state.shows.length) return emptyState();
  const filters = filtersFrom(r.params);
  const q = r.params.get('q') || '';
  const sort = SORTS[r.params.get('sort')] ? r.params.get('sort') : 'title';
  const results = applyFilters(state.shows, filters, q).sort(SORTS[sort][1]);
  const wrap = el('div', { class: 'list-view' });

  const bar = el('div', { class: 'filter-bar' });
  for (const f of filters) {
    const rest = filters.filter((x) => x !== f);
    bar.append(el('a', { class: `chip active ${f.not ? 'excluded' : f.cat === 'status' ? statusClass(f.value) : ''}`, href: listHash(rest, q, sort), title: 'Remove filter' },
      el('span', { class: 'chip-cat' }, RANGE[f.cat] ? `Year ${RANGE[f.cat].toLowerCase()}:` : `${catByKey[f.cat].label}:`), f.not ? el('span', { class: 'not' }, 'not') : null, f.value, el('span', { class: 'x' }, '×')));
  }
  if (q) bar.append(el('a', { class: 'chip active', href: listHash(filters, '', sort) }, `“${q}”`, el('span', { class: 'x' }, '×')));
  const addBtn = el('button', { class: 'btn small', onclick: () => togglePicker() }, '+ Filter');
  bar.append(addBtn);
  if (filters.length || q) bar.append(el('a', { class: 'btn small ghost', href: '#/list' }, 'Clear'));
  if ((filters.length || q) && !readOnly) {
    const query = listHash(filters, q, '').replace(/^#\/list\??/, '');
    bar.append(el('button', { class: 'btn small ghost', title: 'Keep this filter as a named collection', onclick: () => saveListAsCollection(query) }, 'Save as collection'));
  }
  const sel = el('select', { 'aria-label': 'Sort', onchange: () => go(listHash(filters, q, sel.value)) },
    Object.entries(SORTS).map(([k, [label]]) => el('option', { value: k, selected: k === sort }, label)));
  const density = getDensity();
  const densityBtn = (v, label) => el('button', { class: `seg-btn ${density === v ? 'on' : ''}`, 'aria-pressed': String(density === v),
    onclick: () => { if (density !== v) { setDensity(v); render(); } } }, label);
  bar.append(el('span', { class: 'spacer' }), el('span', { class: 'muted' }, `${results.length} of ${state.shows.length}`),
    el('span', { class: 'seg', role: 'group', 'aria-label': 'Layout' }, densityBtn('cards', 'Cards'), densityBtn('rows', 'Rows')), sel);
  wrap.append(bar);
  if (!readOnly && results.length && (filters.length || q)) {
    wrap.append(el('p', { class: 'small deck-link' }, el('a', { href: `#/tags/deck?${r.params.toString().replace(/(^|&)sort=[^&]*/, '')}` },
      `Review tags for ${results.length === 1 ? 'this show' : `these ${results.length} shows`}`),
      filters.length === 1 && filters[0].cat === 'tag' && !filters[0].not ? [' · ', el('a', { href: `#/tags/mode?${new URLSearchParams({ tag: filters[0].value })}` }, `Find more shows for ${filters[0].value}`)] : null));
  }

  // Filter picker: pick several values (in any columns), then Apply. Tap once to include, again to exclude, again to clear.
  const picker = el('div', { class: 'picker card', hidden: true });
  function togglePicker() {
    picker.hidden = !picker.hidden;
    if (picker.hidden || picker.childElementCount) return;
    const pending = new Map(filters.map((f) => [`${f.cat}\u0000${f.value}`, f]));
    const catSel = el('select', { 'aria-label': 'Column' }, CATS.map((c) => el('option', { value: c.key }, c.label)));
    const chips = el('div', { class: 'chips' });
    const applyBtn = el('button', { class: 'btn small primary', onclick: () => go(listHash([...pending.values()], q, sort)) }, 'Apply');
    const status = el('span', { class: 'muted small' });
    const refresh = () => {
      const n = [...pending.values()];
      const changed = n.length !== filters.length || filters.some((f) => { const p = pending.get(`${f.cat}\u0000${f.value}`); return !p || !!p.not !== !!f.not; });
      applyBtn.disabled = !changed;
      status.textContent = n.length ? `${n.length} selected` : '';
    };
    const fill = () => {
      const cat = catByKey[catSel.value];
      // Within the same column, values combine with OR, so count against results without that column's filters.
      const base = applyFilters(state.shows, filters.filter((f) => f.cat !== cat.key), q);
      const entries = counts(cat, base);
      for (const f of pending.values()) if (f.cat === cat.key && !entries.some(([v]) => v === f.value)) entries.push([f.value, 0]);
      chips.replaceChildren(...entries.map(([v, n]) => {
        const key = `${cat.key}\u0000${v}`;
        const cur = pending.get(key);
        const mode = cur ? (cur.not ? 'exc' : 'inc') : 'off';
        return el('button', { class: `chip pick-${mode}`, 'aria-pressed': mode === 'off' ? 'false' : 'true',
          title: mode === 'off' ? 'Tap to include' : mode === 'inc' ? 'Tap to exclude' : 'Tap to clear',
          onclick: () => {
            if (mode === 'off') pending.set(key, { cat: cat.key, value: v });
            else if (mode === 'inc') pending.set(key, { cat: cat.key, value: v, not: true });
            else pending.delete(key);
            fill(); refresh();
          } },
          mode === 'inc' ? el('span', { class: 'mark' }, '✓') : mode === 'exc' ? el('span', { class: 'mark' }, '✕') : null,
          v, el('span', { class: 'count' }, n));
      }));
      if (!chips.childElementCount) chips.append(el('span', { class: 'muted small' }, 'Nothing here.'));
    };
    catSel.onchange = fill;
    const yearInput = (key, label) => {
      const cur = [...pending.values()].find((f) => f.cat === key);
      const input = el('input', { type: 'number', inputmode: 'numeric', min: 1900, max: 2100, placeholder: 'any', value: cur ? cur.value : '', 'aria-label': `Release year ${label}`,
        oninput: () => {
          for (const k of [...pending.keys()]) if (pending.get(k).cat === key) pending.delete(k);
          if (/^\d{4}$/.test(input.value)) pending.set(`${key}\u0000${input.value}`, { cat: key, value: input.value });
          refresh();
        } });
      return el('label', { class: 'inline' }, ` ${label} `, input);
    };
    picker.append(
      el('div', { class: 'row year-range' }, el('span', {}, 'Release year'), yearInput('yfrom', 'from'), yearInput('yto', 'to')),
      el('div', { class: 'row' }, el('label', { class: 'inline' }, 'Filter by ', catSel)),
      el('p', { class: 'muted small' }, 'Tap values to pick as many as you like: once to include (✓), twice to exclude (✕), three times to clear. You can switch columns and keep picking.'),
      chips,
      el('div', { class: 'row picker-actions' }, status, el('span', { class: 'spacer' }),
        el('button', { class: 'btn small ghost', onclick: () => { pending.clear(); fill(); refresh(); } }, 'Clear all'),
        el('button', { class: 'btn small', onclick: () => { picker.hidden = true; picker.replaceChildren(); } }, 'Cancel'),
        applyBtn));
    fill();
    refresh();
  }
  wrap.append(picker);

  // Everything at once (no "Show more"), so Back can return to any spot in the list.
  const item = density === 'rows' ? showRow : showCard;
  const list = el('div', { class: density === 'rows' ? 'show-rows' : 'show-list' }, results.map((s) => {
    const node = item(s);
    node.dataset.jump = jumpLabel(s, sort);
    node.dataset.anchor = s.id; // lets Back and redraws return to this show (router.js)
    return node;
  }));
  wrap.append(list);
  if (!results.length) wrap.append(el('p', { class: 'muted' }, 'No shows match.'));
  // A search that finds little on the list is often a show you want to add.
  if (q && results.length < 3 && !readOnly) wrap.append(el('p', { class: 'muted small' }, results.length ? 'Not what you wanted? ' : '',
    el('a', { href: `#/add?${new URLSearchParams({ q })}` }, `Search TMDB for “${q}”`)));
  return wrap;
}

// What the scroll handle's bubble shows for a show, matching the sort: a letter, a year, an amount of time.
function jumpLabel(s, sort) {
  if (sort === 'title') { const c = norm(s.title).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; }
  if (sort === 'newest' || sort === 'oldest') return s.year ? String(s.year) : 'No year';
  if (sort === 'shortest' || sort === 'longest') { const h = totalHours(s); return h ? fmtHours(h) : 'Unknown'; }
  if (sort === 'eplen') return s.epLength ? `${s.epLength} min` : 'Unknown';
  if (sort === 'seasons') return s.seasons ? `${s.seasons} season${s.seasons === 1 ? '' : 's'}` : 'Unknown';
  return '';
}
