// Status options page: add, rename, color and reorder the statuses.
import { el, toast } from '../util.js';
import { state, save, canEdit } from '../state.js';
import { STATUS_COLORS, statusList } from '../categories.js';
import { go, listHash } from '../router.js';

export function viewStatuses() {
  const list = statusList();
  const used = new Map();
  for (const sh of state.shows) if (sh.status) used.set(sh.status, (used.get(sh.status) || 0) + 1);
  const commit = (next, msg) => {
    if (!canEdit()) return false;
    state.statusSettings = { ...(state.statusSettings || {}), list: next };
    save();
    if (msg) toast(msg);
    return true;
  };
  const move = (from, to) => {
    if (to < 0 || to >= list.length || to === from) return;
    const next = [...list]; next.splice(to, 0, next.splice(from, 1)[0]);
    commit(next);
    requestAnimationFrame(() => document.querySelector(`.status-row[data-i="${to}"] .move-${to > from ? 'down' : 'up'}`)?.focus());
  };
  const rename = (i, input) => {
    const old = list[i].name, name = input.value.trim();
    if (name === old) return;
    if (!name) { input.value = old; return toast('A status needs a name.'); }
    if (list.some((x, j) => j !== i && x.name.toLowerCase() === name.toLowerCase())) { input.value = old; return toast(`There is already a “${name}” status.`); }
    if (!canEdit()) { input.value = old; return; }
    const n = used.get(old) || 0;
    for (const sh of state.shows) if (sh.status === old) sh.status = name;
    commit(list.map((x, j) => (j === i ? { ...x, name } : x)), n ? `Renamed; ${n} show${n === 1 ? '' : 's'} updated` : 'Renamed');
  };
  const remove = (i) => {
    const n = used.get(list[i].name) || 0;
    if (n) return toast(`${n} show${n === 1 ? ' has' : 's have'} this status. Change ${n === 1 ? 'it' : 'them'} first.`,
      { label: 'Show them', run: () => go(listHash([{ cat: 'status', value: list[i].name }])) });
    const gone = list[i];
    if (commit(list.filter((_, j) => j !== i))) toast(`Removed “${gone.name}”`, { label: 'Undo', run: () => { const back = statusList().filter((x) => x.name !== gone.name); back.splice(i, 0, gone); commit(back); } });
  };

  let dragFrom = null;
  const rows = list.map((st, i) => {
    const name = el('input', { class: 'status-name', value: st.name, 'aria-label': 'Status name', onchange: () => rename(i, name) });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
    const n = used.get(st.name) || 0;
    const handle = el('span', { class: 'drag-handle', title: 'Drag to reorder' }, '⠿');
    const row = el('li', { class: 'status-row card', 'data-i': i },
      el('div', { class: 'status-row-top' },
        handle,
        el('span', { class: `pill ${st.color === 'none' ? '' : `st-${st.color}`}` }, st.name),
        n ? el('a', { class: 'muted small', href: listHash([{ cat: 'status', value: st.name }]) }, `${n} show${n === 1 ? '' : 's'}`) : el('span', { class: 'muted small' }, 'unused'),
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn small ghost move-up', type: 'button', disabled: i === 0, 'aria-label': `Move ${st.name} up`, onclick: () => move(i, i - 1) }, '↑'),
        el('button', { class: 'btn small ghost move-down', type: 'button', disabled: i === list.length - 1, 'aria-label': `Move ${st.name} down`, onclick: () => move(i, i + 1) }, '↓'),
        el('button', { class: 'btn small ghost danger', type: 'button', 'aria-label': `Remove ${st.name}`, title: 'Remove', onclick: () => remove(i) }, '✕')),
      el('div', { class: 'status-row-edit' }, name,
        el('div', { class: 'swatches', role: 'group', 'aria-label': `Color for ${st.name}` },
          Object.entries(STATUS_COLORS).map(([c, label]) => el('button', { type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(c === st.color),
            class: `swatch ${c === 'none' ? 'swatch-none' : `st-${c}`} ${c === st.color ? 'current' : ''}`,
            onclick: () => { if (c !== st.color) commit(list.map((x, j) => (j === i ? { ...x, color: c } : x))); } }))),
        el('label', { class: 'inline small spoiler-flag', title: 'Choosing this status turns on a TV show’s Show spoilers switch (episode stills)' },
          el('input', { type: 'checkbox', checked: st.spoilers, onchange: (e) => {
            if (!commit(list.map((x, j) => (j === i ? { ...x, spoilers: e.target.checked } : x)))) e.target.checked = st.spoilers;
          } }), 'Turns on spoilers')));
    // Drag by the handle on desktop; the arrows work everywhere.
    handle.draggable = true;
    handle.addEventListener('dragstart', (e) => {
      dragFrom = i; row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', st.name); e.dataTransfer.setDragImage(row, 20, 20);
    });
    handle.addEventListener('dragend', () => { dragFrom = null; row.classList.remove('dragging'); });
    row.addEventListener('dragover', (e) => { if (dragFrom != null) { e.preventDefault(); row.classList.add('drop-target'); } });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', (e) => { e.preventDefault(); const f = dragFrom; dragFrom = null; if (f != null) move(f, i); });
    return row;
  });

  const newName = el('input', { placeholder: 'New status', 'aria-label': 'New status name' });
  const add = (e) => {
    e.preventDefault();
    const name = newName.value.trim();
    if (!name) return;
    if (list.some((x) => x.name.toLowerCase() === name.toLowerCase())) return toast(`There is already a “${name}” status.`);
    const taken = new Set(list.map((x) => x.color));
    const color = Object.keys(STATUS_COLORS).find((c) => c !== 'none' && !taken.has(c)) || 'none';
    if (commit([...list, { name, color }], `Added “${name}”`))
      requestAnimationFrame(() => document.querySelector('.status-add input')?.focus());
  };
  return el('div', { class: 'statuses-page' },
    el('h1', {}, 'Status options'),
    el('p', { class: 'muted small' }, 'This order is used in the status menus and on the browse page. Renaming a status updates every show that has it. Statuses marked “Turns on spoilers” switch on a TV show’s episode stills when you pick them.'),
    el('ol', { class: 'status-rows' }, rows),
    el('form', { class: 'card status-add row', onsubmit: add }, newName, el('button', { class: 'btn primary', type: 'submit' }, 'Add')),
    el('p', {}, el('a', { href: '#/account' }, '← Account')));
}
