// Wikidata lookups for setting and era: "narrative location" (P840) and "set in period" (P2408), found by TMDB id
// (P4983 TV series, P4947 movie). Queried straight from the browser: query.wikidata.org allows cross-site requests,
// so no proxy is needed. Many shows go in one query.
import { regionName } from './sources.js';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const ALIAS = { 'City of Westminster': 'London', 'Greater London': 'London', 'City of London': 'London' };

// fetchImpl is injectable for tests.
export async function sparql(query, fetchImpl = fetch) {
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query, format: 'json' }).toString(),
  });
  if (!res.ok) throw new Error(`Wikidata lookup failed (${res.status})${res.status === 429 ? ': too many requests, try again in a minute' : ''}`);
  const d = await res.json();
  return d.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value.replace('http://www.wikidata.org/entity/', '')])));
}
const q = (s) => `"${String(s).replace(/[^0-9]/g, '')}"`;
const qids = (list) => list.filter((x) => /^Q\d+$/.test(x)).map((x) => `wd:${x}`).join(' ');

// Step 1: for TMDB titles [{ type, id }], the Wikidata places and periods. Returns Map "tv:123" -> { locs: [qid], pers: [qid] }.
export async function itemsFor(titles, fetchImpl) {
  const tv = titles.filter((t) => t.type === 'tv').map((t) => q(t.id));
  const mv = titles.filter((t) => t.type === 'movie').map((t) => q(t.id));
  const parts = [];
  if (tv.length) parts.push(`{ VALUES ?id { ${tv.join(' ')} } ?item wdt:P4983 ?id . BIND("tv" AS ?type) }`);
  if (mv.length) parts.push(`{ VALUES ?id { ${mv.join(' ')} } ?item wdt:P4947 ?id . BIND("movie" AS ?type) }`);
  const out = new Map(titles.map((t) => [`${t.type}:${t.id}`, { found: false, locs: [], pers: [] }]));
  if (!parts.length) return out;
  const rows = await sparql(`SELECT ?id ?type ?kind ?v WHERE { ${parts.join(' UNION ')}
    OPTIONAL { { ?item wdt:P840 ?v . BIND("loc" AS ?kind) } UNION { ?item wdt:P2408 ?v . BIND("per" AS ?kind) } } }`, fetchImpl);
  for (const r of rows) {
    const e = out.get(`${r.type}:${r.id}`);
    if (!e) continue;
    e.found = true;
    if (r.kind === 'loc' && !e.locs.includes(r.v)) e.locs.push(r.v);
    if (r.kind === 'per' && !e.pers.includes(r.v)) e.pers.push(r.v);
  }
  return out;
}

// Step 2: places. For each place, the chain of places it is "located in", which of them are cities or
// states/provinces, and its country. Returns Map qid -> { name, within, qid } (or no entry when it isn't a usable place).
export async function placesFor(list, fetchImpl) {
  const out = new Map();
  if (!list.length) return out;
  const rows = await sparql(`SELECT ?x ?label ?y ?iso ?own ?city ?state ?area ?fict WHERE {
    VALUES ?loc { ${qids(list)} }
    ?loc wdt:P131* ?x .
    OPTIONAL { ?x rdfs:label ?label FILTER(lang(?label) = "en") }
    OPTIONAL { ?x wdt:P131 ?y }
    OPTIONAL { ?x wdt:P17/wdt:P297 ?iso }
    OPTIONAL { ?x wdt:P297 ?own }
    BIND(EXISTS { ?x wdt:P31/wdt:P279* wd:Q515 } AS ?city)
    BIND(EXISTS { ?x wdt:P31/wdt:P279* wd:Q10864048 } AS ?state)
    BIND(EXISTS { ?x wdt:P31/wdt:P279* wd:Q486972 } || EXISTS { ?x wdt:P31/wdt:P279* wd:Q56061 } AS ?area)
    BIND(EXISTS { ?x wdt:P31/wdt:P279* wd:Q3895768 } AS ?fict)
  }`, fetchImpl);
  const nodes = new Map();
  for (const r of rows) {
    const n = nodes.get(r.x) || { label: '', parents: [], iso: '', own: '', city: false, state: false, area: false, fict: false };
    if (r.label) n.label = ALIAS[r.label] || r.label;
    if (r.y && !n.parents.includes(r.y)) n.parents.push(r.y);
    if (r.iso && !n.iso) n.iso = r.iso;
    if (r.own) n.own = r.own;
    for (const k of ['city', 'state', 'area', 'fict']) if (r[k] === 'true') n[k] = true;
    nodes.set(r.x, n);
  }
  // Ancestors nearest first (breadth-first up the "located in" chain).
  const ancestors = (id) => {
    const seen = new Set([id]), order = [];
    let level = [id];
    while (level.length) {
      const next = [];
      for (const x of level) for (const p of (nodes.get(x) || { parents: [] }).parents) if (!seen.has(p)) { seen.add(p); order.push(p); next.push(p); }
      level = next;
    }
    return order;
  };
  const big = (id) => { const n = nodes.get(id); return n && (n.city || n.state) && !n.own && n.label; };
  for (const id of list) {
    const n = nodes.get(id);
    if (!n || !n.label) continue;
    const country = n.own ? regionName(n.own) : n.iso ? regionName(n.iso) : '';
    if (n.own) { out.set(id, { qid: id, name: country, within: [] }); continue; }
    const ups = ancestors(id).filter(big);
    let name = n.label, chain = ups;
    if (!n.area && !n.city && !n.state) {
      // A building, street or landmark: use the nearest city or state it is in.
      if (ups.length) { name = nodes.get(ups[0]).label; chain = ups.slice(1); }
      else if (n.fict || !country) { if (!n.fict) continue; }
      else { name = country; chain = []; }
    }
    const within = [...new Set([...chain.map((x) => nodes.get(x).label), country || (n.fict ? 'Fictional place' : '')].filter((x) => x && x !== name))];
    if (!country && !n.fict && !within.length) continue; // not a place we can place
    out.set(id, { qid: id, name, within });
  }
  return out;
}

// Step 3: periods. Returns Map qid -> { label, start, end, point } (years).
export async function periodsFor(list, fetchImpl) {
  const out = new Map();
  if (!list.length) return out;
  const rows = await sparql(`SELECT ?p ?label ?start ?end ?point WHERE {
    VALUES ?p { ${qids(list)} }
    OPTIONAL { ?p rdfs:label ?label FILTER(lang(?label) = "en") }
    OPTIONAL { ?p wdt:P580 ?s . BIND(YEAR(?s) AS ?start) }
    OPTIONAL { ?p wdt:P582 ?e . BIND(YEAR(?e) AS ?end) }
    OPTIONAL { ?p wdt:P585 ?t . BIND(YEAR(?t) AS ?point) }
  }`, fetchImpl);
  const num = (v) => (v == null || v === '' ? null : Number(v));
  for (const r of rows) {
    const cur = out.get(r.p) || { label: '', start: null, end: null, point: null };
    if (r.label) cur.label = r.label;
    // Several start/end values: keep the widest span.
    if (num(r.start) != null) cur.start = cur.start == null ? num(r.start) : Math.min(cur.start, num(r.start));
    if (num(r.end) != null) cur.end = cur.end == null ? num(r.end) : Math.max(cur.end, num(r.end));
    if (num(r.point) != null && cur.point == null) cur.point = num(r.point);
    out.set(r.p, cur);
  }
  return out;
}

// All three steps for a batch of titles. Returns Map "tv:123" -> { found, places: [{ name, within, qid }], periods: [...] }.
export async function wikidataFor(titles, fetchImpl) {
  const items = await itemsFor(titles, fetchImpl);
  const locs = [...new Set([...items.values()].flatMap((e) => e.locs))];
  const pers = [...new Set([...items.values()].flatMap((e) => e.pers))];
  const places = new Map(), periods = new Map();
  for (let i = 0; i < locs.length; i += 40) for (const [k, v] of await placesFor(locs.slice(i, i + 40), fetchImpl)) places.set(k, v);
  for (let i = 0; i < pers.length; i += 80) for (const [k, v] of await periodsFor(pers.slice(i, i + 80), fetchImpl)) periods.set(k, v);
  const out = new Map();
  for (const [key, e] of items) {
    const ps = [];
    for (const id of e.locs) { const p = places.get(id); if (p && !ps.some((x) => x.name === p.name)) ps.push(p); }
    out.set(key, { found: e.found, places: ps, periods: e.pers.map((id) => periods.get(id)).filter(Boolean) });
  }
  return out;
}
