// Images from TMDB: a backdrop strip for every linked title, and episode stills for TV shows once
// their Show spoilers switch is on. Stills load one season at a time, only when that season is opened.
import { el, toast } from './util.js';
import { readOnly, save, canEdit } from './state.js';
import { spoilerStatusNames } from './categories.js';
import { getBackdrops, getDetails, getSeasonStills } from './tmdb.js';
import { IMG } from './ui.js';

// Full-size view of one image, with arrows (buttons or keys) to move through the set it came from.
function openViewer(list, i, caption) {
  const dlg = el('dialog', { class: 'image-viewer', 'aria-label': 'Image' });
  const img = el('img', { alt: '' });
  const cap = el('p', { class: 'small image-caption' });
  const show = (j) => {
    i = (j + list.length) % list.length;
    img.src = `${IMG}w1280${list[i].path}`;
    cap.textContent = [caption ? caption(list[i]) : '', list.length > 1 ? `${i + 1} of ${list.length}` : ''].filter(Boolean).join(' · ');
  };
  const nav = list.length > 1 ? [
    el('button', { class: 'viewer-nav prev', type: 'button', 'aria-label': 'Previous', onclick: (e) => { e.stopPropagation(); show(i - 1); } }, '‹'),
    el('button', { class: 'viewer-nav next', type: 'button', 'aria-label': 'Next', onclick: (e) => { e.stopPropagation(); show(i + 1); } }, '›'),
  ] : [];
  dlg.append(img, cap, ...nav, el('button', { class: 'viewer-close', type: 'button', 'aria-label': 'Close', onclick: () => dlg.close() }, '✕'));
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target === img) dlg.close(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); }
  });
  dlg.addEventListener('close', () => dlg.remove());
  show(i);
  document.body.append(dlg);
  dlg.showModal();
}
function thumb(list, i, size, cls, caption) {
  return el('button', { type: 'button', class: `thumb ${cls}`, 'aria-label': caption ? caption(list[i]) : 'Open image', onclick: () => openViewer(list, i, caption) },
    el('img', { src: `${IMG}${size}${list[i].path}`, alt: '', loading: 'lazy' }));
}

// A row of the title's main key art (backdrops with no text). Hidden if TMDB has none; onShow runs when it appears.
export function backdropStrip(t, onShow) {
  const strip = el('div', { class: 'backdrop-strip', hidden: true });
  getBackdrops(t).then((list) => {
    if (!list.length) return;
    strip.replaceChildren(...list.map((_, i) => thumb(list, i, 'w500', 'backdrop')));
    strip.hidden = false;
    if (onShow) onShow();
  }).catch(() => {});
  return strip;
}
// An Images card with only backdrops (movies, and titles not on the list). Stays hidden if there are none.
export function backdropCard(t) {
  const sec = el('section', { class: 'card images', hidden: true }, el('h2', {}, 'Images'));
  sec.append(backdropStrip(t, () => { sec.hidden = false; }));
  return sec;
}

// The Images card on a show page: backdrops, then (TV only) the Show spoilers switch and the stills by season.
// Returns the card; card.refresh() redraws the stills part after the switch or status changes.
export function imagesSection(s) {
  if (!s.tmdb || !s.tmdb.id) return null;
  const t = s.tmdb;
  if (t.type !== 'tv') return backdropCard(t);
  const sec = el('section', { class: 'card images' }, el('h2', {}, 'Images'), backdropStrip(t));
  const stills = el('div', { class: 'stills' });
  const draw = () => stills.replaceChildren(stillsHead(s, draw), s.spoilers ? seasonRows(t) : lockedNote());
  draw();
  sec.append(stills);
  sec.refresh = draw;
  return sec;
}
function stillsHead(s, redraw) {
  const box = el('input', { type: 'checkbox', role: 'switch', checked: !!s.spoilers, disabled: readOnly,
    onchange: () => {
      if (!canEdit()) { box.checked = !!s.spoilers; return; }
      s.spoilers = box.checked;
      save({ quiet: true });
      toast(s.spoilers ? 'Spoilers on: episode stills shown' : 'Spoilers off: episode stills hidden');
      redraw();
    } });
  return el('div', { class: 'stills-head' }, el('h3', { class: 'section' }, 'Episode stills'),
    el('label', { class: 'switch' }, box, el('span', { class: 'switch-track', 'aria-hidden': 'true' }), 'Show spoilers'));
}
function lockedNote() {
  const names = spoilerStatusNames();
  const auto = names.length ? ` Setting the status to ${names.join(', ').replace(/, ([^,]*)$/, ' or $1')} turns it on.` : '';
  return el('p', { class: 'muted small' }, `Hidden so they don't spoil episodes you haven't seen.${auto}`);
}
// One collapsed row per season; a season's stills are fetched the first time it's opened.
function seasonRows(t) {
  const box = el('div', { class: 'season-rows' }, el('p', { class: 'muted small' }, 'Loading seasons…'));
  getDetails(t).then((d) => {
    const seasons = (d.seasons || []).filter((x) => x.episode_count > 0)
      .sort((a, b) => (a.season_number || 999) - (b.season_number || 999)); // specials (season 0) last
    if (!seasons.length) return box.replaceChildren(el('p', { class: 'muted small' }, 'No seasons listed on TMDB.'));
    box.replaceChildren(...seasons.map((x) => seasonRow(t, x)));
  }).catch((e) => box.replaceChildren(el('p', { class: 'muted small' }, e.message)));
  return box;
}
function seasonRow(t, x) {
  const n = x.season_number;
  const label = n === 0 ? 'Specials' : `Season ${n}`;
  const grid = el('div', { class: 'stills-grid' });
  const row = el('details', { class: 'season-row' },
    el('summary', {}, label, el('span', { class: 'muted small' }, ` · ${x.episode_count} episode${x.episode_count === 1 ? '' : 's'}`)), grid);
  let loaded = false;
  row.addEventListener('toggle', () => {
    if (!row.open || loaded) return;
    loaded = true;
    grid.replaceChildren(el('p', { class: 'muted small' }, 'Loading stills…'));
    getSeasonStills(t, n).then((list) => {
      if (!list.length) return grid.replaceChildren(el('p', { class: 'muted small' }, 'No stills on TMDB for this season.'));
      const caption = (e) => `${n === 0 ? 'Special' : `S${n}`} · E${e.ep}`;
      grid.replaceChildren(...list.map((e, i) => el('figure', { class: 'still' },
        thumb(list, i, 'w300', 'still-img', caption), el('figcaption', { class: 'small muted' }, caption(e)))));
    }).catch((e) => { loaded = false; grid.replaceChildren(el('p', { class: 'muted small' }, e.message)); });
  });
  return row;
}
