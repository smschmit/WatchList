# Watch List: to do

Remaining plan for future features. Done so far: module split (`public/js/`), TMDB facts kept apart from your Show status, the Updates page with a manual check button, the Fiction / Tone / Era / Setting fields with Fill from TMDB, Tag cleanup, the Tag Deck, and spoiler-safe show images.

## Next up

- [x] **Try the Updates page on real data.** Done.
- [x] **Link the remaining TV shows to TMDB.** Almost all done; a few left (Account → TMDB → Link titles).
- [x] **Work through the first "Show status to review" list.** Done.

- [ ] **Plan: make Updates checks faster.** Finished shows are now always checked (about 310 more shows per run), so a full check is slow. Ideas to weigh, not decided:
  - Check ended/canceled Finished shows less often (e.g. once a month) instead of every run.
  - Use TMDB's `/tv/changes` feed to check only shows that changed since the last run.
  - Run more checks at once than the current 4.
  - Run checks in the background on a schedule (Netlify scheduled function) so the page shows results instead of waiting.

## Fields and tags (next steps)

- [ ] **Fill from TMDB: fill the rest.** Try 10 looked fine; next, run **Fill N shows** (Account → TMDB → Fill from TMDB). Tested on 99 of your shows: Setting came from Wikidata for 42%, TMDB keywords 16%, nothing 43%; Era from Wikidata 8%, keywords 19%, a Present day guess 60%, nothing 13%; Tone from keywords 13%, genres 12%, nothing 74%.
- [ ] **Tag cleanup in this order:** merge spellings → remove genre repeats → move Fiction/Tone tags → answer the ambiguous ones → remove setting, era and origin tags (after the fill) → one-offs.
- [x] **Tag Deck felt like too much (v0.6.1):** shows now come in random order (unreviewed first), and Fiction / Tone / Era / Setting etc. are folded into a closed **Fields** section, so a card is mostly tags. Check whether that's enough, or whether Tag Mode replaces it.
- [ ] **Tag Mode (next).** Pick one tag and swipe through shows that might fit it; right adds the tag, left skips. Likely closer to what you want than the deck. To decide: how candidates are found (TMDB keywords, shows similar to ones already tagged, genre), and whether "no" is remembered.

## Show images (spoiler-safe)

Pull more images from TMDB, which the app already uses, without spoiling unwatched episodes.

### Decisions

- **Unlock rule:** a per-title **Show spoilers** switch (`spoilers: true/false`), separate from status. Statuses stay as they are. When on, all episode stills for every season are shown.
- **Auto-on:** setting the status to **Finished**, **Rewatching** or **Dropped** turns the switch on. The app never turns it off; you can flip it either way by hand at any time, whatever the status.
- **Where the switch lives:** on the show page, next to the Stills section (TV only, since movies have no stills).
- **Movies:** always show backdrops, same top ~6 filter. No locking (movies have no episode stills).
- **Before unlock:** poster plus a small set of show-level backdrops. TMDB doesn't date backdrops or tie them to seasons, so "early only" can't be enforced. Use the top ~6 by vote with no text (`iso_639_1` null), which tend to be main key art. If that still spoils something, fall back to poster only.
- **Cast list:** leave as is. It keeps the full cast and the episode counts.
- **Stills layout:** a collapsed "Stills" section on the show page, one row per season. A season's stills load only when you open that row, so nothing is fetched for locked shows or for seasons you don't open.
- **Episode text:** show only "S2 · E4" next to each still, no titles or summaries.

### Built (v0.6.0)

- [x] Proxy allows `/{tv|movie}/{id}/images` and `/tv/{id}/season/{n}`.
- [x] Backdrop strip on show, movie and title pages (top 6 text-free backdrops by vote, from a separate `/images` call so the cached details stay small). Tap one for a full-size viewer.
- [x] `spoilers` on the show model; each status option carries a "Turns on spoilers" flag (Account → Status options), so renaming keeps it. Finished, Rewatching and Dropped have it by default.
- [x] Show spoilers switch and per-season Stills rows on TV show pages; a season loads only when opened (one still per episode from the season details, labeled "S2 · E4" only).
- [x] TMDB credit line (Account page and README).

### Still open

- [x] **Try it on real data.** Images look good.
- [ ] Decide whether the sheet export (`apps-script/`) should include a Spoilers column. Left out for now.
- [ ] Stills use one image per episode (what the season lookup returns). More per episode would need `/tv/{id}/season/{n}/episode/{e}/images`, one call per episode.

### Maybe later

- A "Spoilers on" filter in the browse view.
- Extra actor headshots from `/person/{id}/images`.
- Track a current episode per show and unlock stills up to that point.

Other image sources if TMDB falls short: TVmaze (free, no key, character photos, CC BY-SA attribution) and Fanart.tv (free key, logos and art).

## Where to watch

Show where each title is streaming, renting or for sale, and answer the main question it raises: what on my Want to Watch list can I watch tonight on services I already pay for?

### Data source

- TMDB's `/{tv|movie}/{id}/watch/providers`, which the app's TMDB token already covers. Checked live: Breaking Bad returns US → Netflix (subscription), plus Amazon Video, Apple TV Store, Google Play, Fandango At Home (buy). Results are per country, split into `flatrate` (subscription), `free`, `ads`, `rent` and `buy`, each with provider id, name, logo and display priority.
- The data comes from JustWatch. TMDB's terms require crediting JustWatch wherever it's shown.
- Limits: no per-provider deep links (only one TMDB "watch" page per title, which links onward), no "leaving on" dates, no per-season detail. Unlinked titles get nothing, so linking the rest to TMDB matters more.
- `/watch/providers/{tv|movie}?watch_region=US` lists every provider in a region, for the "My services" picker.

### Proposed design

- **Kept apart from Network / platform.** `network` stays your original-network field and is never overwritten. Where to watch is TMDB data, stored like `facts`: `show.watch = { region, checkedAt, flatrate: [ids], free: [ids], ads: [ids], rent: [ids], buy: [ids] }`, never edited by hand. Provider names and logos live once in `state.providers` (id → name, logo), not on every show.
- **Region:** one setting, default US. Stored with the list, so every device and viewer sees the same region.
- **My services:** Account → Where to watch → pick the services you subscribe to from TMDB's provider list (logos). Saved in `state.myServices`.
- **Fold duplicate plans:** "Netflix Standard with Ads" → Netflix, "Amazon Prime Video with Ads" → Prime Video; Amazon/Apple/Roku "channels" (e.g. "HBO Max Amazon Channel") count as the parent service, labeled "via Amazon". A small hand-kept map, falling back to TMDB's name.
- **Show page:** a "Where to watch" line under the meta line: subscription services as logo chips (yours highlighted and listed first), then free/with ads, then a collapsed "Rent or buy from N stores". Each links to the TMDB watch page. "Data from JustWatch · checked 12 Nov". Opening the page refreshes the stored snapshot if it's over 7 days old.
- **Browse:** a **Where to watch** category (multi-value, subscription + free only, so rent/buy don't make every title count under Apple TV Store) and an **On my services** category (Yes / Rent or buy only / Not available / Not checked). Combined with My status = Want to Watch, that's the "watch tonight" list, and it's a bookmarkable link.
- **Bulk check:** Account → TMDB → **Check where to watch** for all linked titles, using the same few-at-a-time approach as the Updates check, with **Try 10 first**. Skips titles checked in the last 30 days unless asked. About 1,200 calls on a full run.
- **Updates page:** a "Now on your services" section for Want to Watch / Waiting titles that weren't on any of your services at the last check and now are. "Left your services" for titles that dropped off, since TMDB gives no warning before they go.
- **Proxy:** add `/^\/(tv|movie)\/\d+\/watch\/providers$/` and `/^\/watch\/providers\/(tv|movie)$/` to `ALLOWED` in `netlify/functions/tmdb.mjs`. Needs a deploy before anything works on the live site.
- **Credit:** add "Where to watch data from JustWatch" to the Account credit line and the README.

### Build order

- [x] **1. Show page line, live only (v0.7.6).** Proxy allows `/{tv|movie}/{id}/watch/providers` and `/watch/providers/{tv|movie}`; `public/js/watch.js` shows Stream / Free / Rent or buy on show and title pages (US), cached on the device for a day; plans and Amazon/Apple/Roku channels folded into one service; JustWatch credit on the block, Account page and README. A service in both Free and Stream is listed under Free only.
  - [ ] Try it on real shows after deploy; check the folding (live-TV services like YouTube TV, TBS, Spectrum also show under Stream, which step 2's My services highlighting should make less noisy).
- [ ] **2. Region and My services.** Account section with the provider picker; show page highlights yours.
- [ ] **3. Stored snapshot, bulk check, browse categories.** `show.watch`, `state.providers`, Check where to watch, Where to watch and On my services categories.
- [ ] **4. Updates integration.** Now on / left your services.

### Open decisions

- [ ] **Region:** US only, or should a second region be checkable (e.g. UK, for the BBC / Channel 4 / ITV titles)? Adds a picker and doubles bulk calls.
- [ ] **Rent and buy:** show them at all? They're on almost every title and add noise. Proposed: collapsed on the show page, left out of browse.
- [ ] **Stored on each show (synced) or on this device only?** Stored is needed for browse and Updates; device-only keeps the synced list smaller. Proposed: stored, ids only (a few bytes per show).
- [ ] **Sheet export:** add a "Where to watch" column with your services' names?
- [x] **Auto-fill Network from it?** Decided no: the original network and today's streamers are separate facts (The Office: NBC, now Peacock). Network stays your field.
- [ ] Later: use My services to filter recommendations (TMDB `/discover` takes `with_watch_providers` and `watch_region`).

## Seasons, episodes and where I am

A season → episode guide on TV show pages, and where you are in each show. (Songs are benched: see the end of this section.)

### Data source

- TMDB, already in use. `/tv/{id}` gives the season list and `/tv/{id}/season/{n}` gives every episode (number, title, overview, air date, runtime, still). The proxy already allows both, and `getDetails` / `getSeasonStills` already fetch them. Nothing new to set up.

### Proposed design

- **Episodes come from TMDB live, not stored in the list.** Cached on the device, slimmed to what the page shows (about 4 KB a season). 7 days, or 1 day for the current season of a show that's still airing.
- **Where you are:** a new top-level map `state.progress = { [showId]: { season, episode, at } }`, the last episode you've watched. Kept off the show record on purpose: sync merges a whole show at a time, so if progress lived on the show, marking an episode on the phone and editing notes on the laptop before they sync would lose one of the two. A separate map merges per show on its own (`mergeKeyed` in `cloud.js`), so progress and show edits never collide. About 50 bytes a show.
- **Spoilers:** episode titles, overviews and stills are spoilers. Show them for episodes up to your progress, or for everything when **Show spoilers** is on. Later episodes show only "S2 · E5" and the air date. This also covers the "unlock stills up to the current episode" item under Show images.

### Screens

- **Show page → Episodes card** (TV shows linked to TMDB), replacing the "Episode stills" part of Images: one collapsed row per season ("Season 2 · 10 episodes · 3 watched"), loaded when opened, the season you're in open by default. Each episode row: S·E, title (if unlocked), air date, runtime, still (if unlocked), and a ✓ to mark watched up to here. Unaired episodes say "Airs Mar 4".
- **Show header:** "Up next: S2 · E5" with **Watched it** (moves progress on, rolls to the next season). Not started: "Start with S1 · E1".
- **Read-only viewers** see episodes and progress but can't change it (same `canEdit()` checks as today).

### Interactions with what's there

- **Status:** marking the last aired episode watched offers to set My status to Finished (or Paused Between Seasons if the show is still running). Picking Watching on a show with no progress offers "Start at S1 · E1?". Setting Finished doesn't touch progress.
- **Updates page:** "new season out" becomes "N new episodes since S3 · E8", and Waiting shows say exactly where to resume.
- **Backups / CSV / sheet export:** progress goes in the JSON backup automatically. CSV and the Google Sheet get a "Progress" column ("S2 · E5").

### Build order

1. [ ] Episodes card with seasons and episode rows from TMDB, spoiler rules, replaces the stills section (`images.js` → new `episodes.js`).
2. [ ] `state.progress`, the ✓ per episode, "Up next" in the show header, the status prompts.
3. [ ] Updates page uses progress; Progress column in CSV and sheet export.
4. [ ] README, `ASSETS` in `sw.js`, bump `CACHE` and `APP_VERSION`.

### Open decisions

- [ ] **Progress model:** last-watched episode (recommended) or a full per-episode checklist (handles skipping around and rewatches, more taps, more data).
- [ ] **Importing history:** Netflix has no API, but its viewing activity downloads as a CSV (title like "Show: Season 1: Episode", plus date). An import could match those to TMDB episodes and set progress. One-off or occasional, not real time. Trakt.tv (has an API; a browser extension scrobbles Netflix) is the only route to near-automatic tracking, at the cost of another account.

### Benched: songs per episode

Songs you noticed in an episode, kept in a top-level `state.songs` list (merges item by item already). No free source maps songs to episodes (TMDB has none; Tunefind and WhatSong have no public API), so they'd be entered by hand with a song search (iTunes Search API, free, untested from here). Shazam has no API either; the workable route is Shazam's "My Shazam Tracks" playlist synced to Spotify or Apple Music, read through their APIs, with each song's added time matched to what you were watching. Revisit later.

## Collections ("my type of sitcoms", "my favorite crime thrillers")

- [ ] Each collection has a name, a plain-language description, an optional saved filter, and titles pinned in or left out by hand.
- [ ] Collections show on the home page above the browse columns.
- [x] **Clean up tags at the same time.** Tag cleanup and the Tag Deck are built (see above); collections can use Fiction, Tone, Era and Setting as well as tags.
- [ ] Later: use the description to sort existing shows into a collection, and to drive "more like this" recommendations.

## Recommendations

- [ ] **Add a quick rating** (loved / liked / meh) so recommendations have more to go on than Top 50 and Finished vs Dropped.
- [ ] **Add a Suggestions queue, kept separate from the main list.** Each suggestion has **Add** and **Not interested**, and dismissals are remembered so they don't come back.
- [ ] **Find candidates using TMDB data only:** TMDB's recommended and similar titles for your Top 50, favorite actors' credits, and discovery by genre or keyword. Drop anything already on the list or dismissed. The TMDB proxy (`netlify/functions/tmdb.mjs`) needs these lookups added to its allowed list.
- [ ] **Rank candidates:** start with simple overlap scoring against your Top 50 titles. Optionally have Claude rank them with a reason for each (see the open decisions).

## New titles

- [ ] **Favorite actors' new projects.** Compare each actor's saved credits with TMDB's current ones and add new ones to Updates.
- [ ] Optional: list new and trending titles that fit your collections.

## Open decisions

- [ ] **Where suggestions go:** a separate queue (recommended) or straight onto the list as "Recommended", as now.
- [ ] **Claude in the app:** do you want it? It needs an Anthropic API key and costs per use. The cheaper alternative is an "export my taste profile" button to paste into Claude, then importing the results.
- [ ] **Viewers:** should people you share with see collections and suggestions, or only the list?
- [ ] **Automatic checks:** later, optionally, a nightly check plus phone notifications. That needs a Supabase admin key stored as a secret in Netlify, and machine-generated data would then move to its own tables so a background job can't overwrite your edits. For now, the manual button.

## Device storage (move to IndexedDB)

Today the whole list is one JSON document (~650 KB), kept in one Supabase row and in the browser's localStorage. The browser keeps it twice (the list plus the "last synced" copy that the three-way merge compares against), so it already uses ~1.3 MB of localStorage's ~5 MB per-site cap. The TMDB cache (up to 120 responses, `public/js/tmdb.js`) and the viewer copy share the same space.

The one-document model and the Supabase row are fine for one editor plus viewers; keep them. The problem is localStorage:
- **The cap.** The list, the "last synced" copy and the TMDB cache all share ~5 MB.
- **Silent failure.** `writeBase` in `public/js/cloud.js` swallows errors, so with storage full the "last synced" copy goes stale and the merge compares against an old copy. That could bring back a deleted show or misjudge which edit is newer (possible from the code, not reproduced). Only the main list write warns "storage is full".
- **Blocking saves.** Every edit rewrites the whole 650 KB at once (`writeLocal` in `public/js/state.js`), briefly freezing the page.

### Plan

- [ ] **1. Measure (now).** Log the size of each localStorage key, and how much of the list is TMDB-derived (`facts`, `sourced`, actor `credits`) versus what you typed.
- [x] **2. Make storage failures loud (v0.7.21).** When storage is full, saves drop the TMDB cache (and the owner's unused viewer copy) and retry. The TMDB cache is capped at ~1 MB. The "last synced" copy is also kept in memory, so merges stay correct for the rest of the visit, and the sync status shows "⚠ Storage full" with the MB used. Syncing doesn't pause: when the device can't save, the cloud is the only durable copy. Still open: after a reload the merge uses whatever older copy is on the device.
- [ ] **3. Move device storage to IndexedDB (next few weeks, its own release).** No practical 5 MB cap, saves in the background, stores objects without converting to text. Moves: the list, the "last synced" copy, the viewer copy, the TMDB cache. Small settings (cards/rows) stay in localStorage. Mostly `state.js`, `cloud.js`, `tmdb.js`; startup has to wait for the data before drawing the list. Supabase doesn't change.
  - One-time copy on first load: copy localStorage → IndexedDB, verify, only then clear the old keys; on any failure keep using the old data.
  - Before updating: sync every device so Supabase holds a current copy. After: open the app on each device over the next few days to confirm the copy worked.
  - Bump `APP_VERSION` and `CACHE`.
- [ ] **4. Decide about TMDB-derived data (after step 1).** `facts` and `sourced` aren't throwaway: Updates compares against `facts`, and `sourced` supplies values for fields you haven't set. Move them out of the synced list only if they're most of the 650 KB.
- Do step 3 sooner if: total storage passes ~3 MB, a "storage is full" message appears, a deleted show comes back, or a bulk import or image-heavy feature is planned.
- Leave Supabase as one row unless you add editors or the list grows ~10x.

### For the Zettelkasten app (later, separate app)

Don't reuse the one-document design: images can't live in the JSON, the note count only grows, and edits are one note at a time. Do WatchList's IndexedDB move first and reuse the storage layer.
- Supabase: a `notes` table (one row per note, `updated_at`, `deleted` flag), a `links` table rebuilt from `[[links]]` on save (for backlinks), images in a private Supabase Storage bucket named by a hash of their contents, Postgres full-text search.
- Device: notes one record each in IndexedDB, cached images plus thumbnails, an outbox for offline edits and uploads.
- Sync only changed notes; on a same-note conflict keep both versions and show it. Images never conflict (new image, new name).
- Decide first: single editor or shared editing (shared needs real-time sync, a much bigger build); image volume (free plan has 1 GB, so shrink photos before upload); a Markdown + images export from the start.

## Housekeeping

- [ ] When you add files under `public/js/`, list them in `ASSETS` in `public/sw.js`, and bump `CACHE` together with `APP_VERSION` in `public/js/version.js`.
