// Tag groups: your own smaller categories of tags ("Workplace", "Who it centers", "Comedy style"...).
// A group holds tags; a show can have any number of tags from a group (unlike Fiction or Tone, which have one value).
// Each tag sits in at most one group. Saved in state.tagGroups = [{ id, name, tags: [tag names] }], in order.
// Each group is also a browse column (key "tg-<id>"), so it gets its own section on Browse and in + Filter.
import { newId } from './util.js';
import { state } from './state.js';
import { tagKey } from './tagrules.js';

export function groupList() {
  return (Array.isArray(state.tagGroups) ? state.tagGroups : []).filter((g) => g && g.id && g.name)
    .map((g) => ({ id: g.id, name: g.name, tags: Array.isArray(g.tags) ? g.tags.filter(Boolean) : [] }));
}
export function setGroups(list) { state.tagGroups = list.map((g) => ({ id: g.id, name: g.name, tags: [...g.tags] })); }
export const groupKey = (g) => `tg-${g.id}`;
// Tag name -> group, for every grouped tag.
export function groupOfMap(groups = groupList()) {
  const m = new Map();
  for (const g of groups) for (const t of g.tags) if (!m.has(t)) m.set(t, g);
  return m;
}
export function newGroup(name) { return { id: newId('g'), name: name.trim(), tags: [] }; }
// Put a tag in a group (taking it out of any other), or out of every group when groupId is null.
export function moveTag(tag, groupId) {
  setGroups(groupList().map((g) => ({ ...g,
    tags: g.id === groupId ? (g.tags.includes(tag) ? g.tags : [...g.tags, tag]) : g.tags.filter((t) => t !== tag) })));
}
// A tag renamed (or merged into another) on every show: its group follows. Merging into a tag that already has a group keeps that group.
export function renameInGroups(from, to) {
  const groups = groupList();
  const toHas = groups.some((g) => g.tags.includes(to));
  setGroups(groups.map((g) => ({ ...g, tags: [...new Set(g.tags.flatMap((t) => (t === from ? (toHas ? [] : [to]) : [t])))] })));
}

// Starter groups, offered once you have tags: each lists tag names (matched ignoring capitals, hyphens and spaces).
// Only tags you already use are put in, and only groups that would get at least two.
export const STARTER_GROUPS = [
  ['Who it centers', ['female-led', 'black-led', 'lgbtq+', 'lgbtq', 'queer', 'teen', 'teens', 'family', 'ensemble', 'kids', 'latino-led', 'latinx', 'asian-led', 'older women', 'disability']],
  ['World / workplace', ['workplace', 'office', 'legal', 'lawyers', 'courtroom', 'medical', 'hospital', 'police', 'cops', 'political', 'politics', 'tech', 'startup', 'school', 'high school', 'college', 'sports', 'military', 'restaurant', 'food', 'cooking', 'journalism', 'newsroom', 'fashion', 'music industry', 'showbiz', 'finance', 'business', 'royalty', 'religion', 'prison', 'hotel']],
  ['Crime & mystery', ['procedural', 'detective', 'mystery', 'whodunit', 'heist', 'spy', 'espionage', 'serial killer', 'true crime', 'con artist', 'con', 'cop show', 'organized crime', 'mafia', 'cartel', 'murder', 'conspiracy']],
  ['Comedy style', ['sitcom', 'dark comedy', 'satire', 'cringe', 'mockumentary', 'parody', 'surreal', 'absurdist', 'absurd', 'sketch', 'slapstick', 'deadpan', 'improv', 'dramedy', 'romcom', 'rom com', 'romantic comedy']],
  ['Themes', ['friendship', 'female friendship', 'grief', 'relationships', 'romance', 'coming of age', 'marriage', 'divorce', 'parenting', 'motherhood', 'addiction', 'mental health', 'class', 'race', 'identity', 'revenge', 'redemption', 'feminist', 'found family', 'dating', 'sibling', 'siblings', 'aging', 'immigrant', 'immigration', 'power', 'wealth', 'rich people']],
  ['Characters', ['character driven', 'antihero', 'psychological', 'unlikeable lead', 'flawed lead', 'morally grey', 'villain']],
  ['Speculative', ['supernatural', 'time travel', 'space', 'apocalyptic', 'post apocalyptic', 'superhero', 'marvel', 'dc', 'dystopian', 'dystopia', 'aliens', 'zombies', 'vampires', 'magic', 'ai', 'robots', 'ghosts', 'witches', 'multiverse', 'alternate history']],
  ['Format', ['anthology', 'spin off', 'spinoff', 'book adaptation', 'comic adaptation', 'remake', 'reboot', 'revival', 'animated adult', 'adult animation', 'animated', 'miniseries', 'limited series', 'musical', 'soap', 'talk show', 'game show', 'two hander', 'single camera', 'multi camera']],
];
// Returns { groups, added } where groups is the new list: starter groups merged into yours (by name), with only ungrouped tags added.
export function withStarterGroups(allTags) {
  const groups = groupList();
  const grouped = new Set(groups.flatMap((g) => g.tags));
  const byKey = new Map();
  for (const t of allTags) if (!grouped.has(t)) { const k = tagKey(t); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(t); }
  let added = 0;
  for (const [name, words] of STARTER_GROUPS) {
    const tags = [...new Set(words.flatMap((w) => byKey.get(tagKey(w)) || []))].filter((t) => !grouped.has(t));
    const existing = groups.find((g) => tagKey(g.name) === tagKey(name));
    if (!tags.length || (!existing && tags.length < 2)) continue;
    for (const t of tags) grouped.add(t);
    added += tags.length;
    if (existing) existing.tags = [...existing.tags, ...tags];
    else groups.push({ ...newGroup(name), tags });
  }
  return { groups, added };
}
