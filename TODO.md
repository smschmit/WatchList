# Watch List: to do

Remaining plan for future features. v0.8.0 built most of this file; see `TEST-CHECKLIST.md` for what to try by hand. Done so far: module split (`public/js/`), TMDB facts kept apart from your Show status, the Updates page with a manual check button, the Fiction / Tone / Era / Setting fields with Fill from TMDB, Tag cleanup, the Tag Deck, and spoiler-safe show images.

## Next up

- [x] **Try the Updates page on real data.** Done.
- [x] **Link the remaining TV shows to TMDB.** Almost all done; a few left (Account → TMDB → Link titles).
- [x] **Work through the first "Show status to review" list.** Done.

- [x] **Make Updates checks faster (v0.8.0).** Finished shows TMDB already has as ended/canceled are rechecked once a month instead of every run; 6 checks run at once instead of 4.
  - Not done: TMDB's `/tv/changes` feed (it lists every changed show on TMDB, many pages a day, so it may cost more calls than it saves) and a scheduled background check (needs a Supabase admin key as a Netlify secret; see Automatic checks below).

## Fields and tags (next steps)

- [ ] **Fill from TMDB: fill the rest.** Try 10 looked fine; next, run **Fill N shows** (Account → TMDB → Fill from TMDB). Tested on 99 of your shows: Setting came from Wikidata for 42%, TMDB keywords 16%, nothing 43%; Era from Wikidata 8%, keywords 19%, a Present day guess 60%, nothing 13%; Tone from keywords 13%, genres 12%, nothing 74%.
- [ ] **Tag cleanup in this order:** merge spellings → remove genre repeats → move Fiction/Tone tags → answer the ambiguous ones → remove setting, era and origin tags (after the fill) → one-offs.
- [x] **Tag Deck felt like too much (v0.6.1):** shows now come in random order (unreviewed first), and Fiction / Tone / Era / Setting etc. are folded into a closed **Fields** section, so a card is mostly tags. Check whether that's enough, or whether Tag Mode replaces it.
- [x] **Tag Mode (v0.8.0).** `#/tags/mode`: pick one tag, swipe through likely shows. Candidates: a TMDB keyword matching the tag, plus tags, genres and favorite actors that tend to go with it on shows that have it. "No" is remembered per tag (`state.tagNo`), with Forget. Works best after Fill from TMDB has saved keywords.

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
- [x] Sheet export includes a Spoilers column (v0.8.0).
- [ ] Stills use one image per episode (what the season lookup returns). More per episode would need `/tv/{id}/season/{n}/episode/{e}/images`, one call per episode. Left as is.

### Maybe later

- A "Spoilers on" filter in the browse view.
- Extra actor headshots from `/person/{id}/images`.
- ~~Track a current episode per show and unlock stills up to that point.~~ Built with Episodes (v0.8.0).

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
- [x] **2. Region and My services (v0.8.0).** `#/watch` (Account → Where to watch): region picker and the services picker; show pages highlight yours.
- [x] **3. Stored snapshot, bulk check, browse categories (v0.8.0).** `show.watch` stores service names (not ids, so no `state.providers` map is needed), Check where to watch with Try 10 first, On my services and Where to watch categories. On my services also has Free and Other services values.
- [x] **4. Updates integration (v0.8.0).** Now on / Left your services, for Want to Watch, Restart Planned, Waiting… and Ready titles.

### Open decisions

- [x] **Region:** one region for the list, changeable (US default). A second region at once is not built.
- [x] **Rent and buy:** collapsed on the show page, left out of browse (as proposed).
- [x] **Stored on each show:** yes, service names.
- [x] **Sheet export:** "On My Services" column.
- [x] **Auto-fill Network from it?** Decided no: the original network and today's streamers are separate facts (The Office: NBC, now Peacock). Network stays your field.
- [ ] Later: use My services to filter Suggestions (TMDB `/discover` takes `with_watch_providers` and `watch_region`).

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

1. [x] Episodes card with seasons and episode rows from TMDB, spoiler rules, replaces the stills section (`episodes.js`, v0.8.0).
2. [x] `state.progress` (`progress.js`), the ✓ per episode, "Up next" in the show header, the caught-up status prompt. Not built: the "Start at S1 · E1?" prompt when picking Watching (the header already says "Start with S1 · E1").
3. [x] Updates says "N new episodes since S3 · E8 · resume at S3 · E9"; Progress column in CSV and sheet export.
4. [x] README, `ASSETS` in `sw.js`, `CACHE` and `APP_VERSION`.

### Open decisions

- [x] **Progress model:** last-watched episode (as recommended).
- [ ] **Importing history:** Netflix has no API, but its viewing activity downloads as a CSV (title like "Show: Season 1: Episode", plus date). An import could match those to TMDB episodes and set progress. One-off or occasional, not real time. Trakt.tv (has an API; a browser extension scrobbles Netflix) is the only route to near-automatic tracking, at the cost of another account.

### Benched: songs per episode

Songs you noticed in an episode, kept in a top-level `state.songs` list (merges item by item already). No free source maps songs to episodes (TMDB has none; Tunefind and WhatSong have no public API), so they'd be entered by hand with a song search (iTunes Search API, free, untested from here). Shazam has no API either; the workable route is Shazam's "My Shazam Tracks" playlist synced to Spotify or Apple Music, read through their APIs, with each song's added time matched to what you were watching. Revisit later.

## One-click "Seen it": add a title as Finished

Logging a movie you've already watched takes two steps today: **+ Add** (lands as Identified), then open the status menu and pick Finished. Most movies you add after the fact are already seen, so this should be one tap.

### Proposed design

- **A second button beside every + Add:** **✓ Seen it**, styled as a plain (non-primary) button so + Add stays the main action. It adds the title from TMDB with My status = Finished in one tap.
- **Where it appears:** the three places that already have + Add:
  - Add page search results (`hitActions` in `public/js/views/add.js`). Also beside **Add anyway** when a possible match is shown.
  - Title page (`viewTitle` in `public/js/views/title.js`), next to **+ Add to my list**.
  - Actor filmography rows (`creditRow` in `public/js/views/actors.js`), the main place you'd tick off old movies.
- **How it works:** `addFromTmdb(t, { status })` already lets `extra` override the default status, so no new add path is needed. Add a small helper in `public/js/library.js`, e.g. `addAsFinished(t, extra)`, that:
  - picks the status name: `Finished` if it's in the status list, otherwise the first status flagged "Turns on spoilers", otherwise falls back to a plain add (so renaming Finished doesn't break it);
  - sets `spoilers: true` for TV shows, matching what `setStatus` does when you pick Finished by hand (`addFromTmdb` skips `setStatus`, so this has to be done here);
  - keeps the `sources` the caller passes (e.g. `Actor: <name>`).
- **Feedback:** toast "Added <title> as Finished" with **Undo** (removes it, same as the Add page's undo today). Then the row redraws as "On your list · Finished", like any other add.
- **Already on the list:** no change. Rows for titles you already have show the status pill or status menu, where Finished is one pick away.
- **Read-only viewers:** hidden, same as + Add.
- **Hand-added titles ("Not on TMDB?"):** left out; that path opens the edit form anyway, where status is set.

### Build order

1. [x] `addAsFinished` helper in `library.js` (v0.8.0).
2. [x] Buttons on the Add page results, title page and actor filmography rows (and Suggestions), with Undo.
3. [x] Phone width: actor rows shrink to + and ✓ icons.
4. [x] README line, `CACHE` and `APP_VERSION`.

### Open decisions

- [x] **Label:** "✓ Seen it".
- [x] **TV shows too:** both.
- [ ] **Remember when you watched it?** There's no watched-date field today. Out of scope unless you want one; it would be a new show field and a CSV/sheet column.
- [ ] **Long-press / second option for Dropped or Some?** Probably not; keeps it one button.

## Actor page: "Seen" and "Plan to see" buttons

The usual question on an actor page is "which of these have I seen?" It can be answered today (Filters → My list → tick Finished, Rewatching…), but that takes several taps every time, and "Use as default" applies one filter set to every actor page. The answer needs to be one tap, on the actor page, above the filmography.

### Proposed

- [x] **Seen** and **Plan to see** buttons with counts, built on the My list group, working with Use as default (v0.8.0).

### Open decisions

- [x] **Seen:** statuses flagged "Turns on spoilers" (so renaming keeps working) plus Watching and Some.
- [x] **Plan to see:** Want to Watch, Restart Planned, Waiting on Release and Now It's Ready.
- [ ] Same two buttons on browse lists filtered by a favorite actor? Not built.

## Search for actors

Today the only way to reach an actor is through a show's cast, and the Actors page is a dead end with no favorites. The proxy already allows `/search/person`, and `#/actor/:id` already works for any TMDB person, so no server change is needed.

### Decided

- **Acting only:** show only people whose TMDB `known_for_department` is Acting. The actor page reads cast credits only (`getPerson` uses `c.cast`), so directors and writers would open on an empty filmography.
- **Lives on the Actors page**, not the Add page's type selector (Add is edit-only and about putting titles on the list).

### Plan

- [x] Built as planned (v0.8.0): search box on the Actors page, `searchPeoplePage`, person result cards, and a shared `pagedSearch` helper in `ui.js` used by title and people search.
- Note: filtering favorites works for everyone; TMDB results need sign-in, like all lookups.

## Collections ("my type of sitcoms", "my favorite crime thrillers")

- [x] Each collection has a name, a plain-language description, an optional saved filter, and titles pinned in or left out by hand (`state.collections`, v0.8.0).
- [x] Collections show on the home page above the browse columns; Save as collection on filtered lists; a Collections line on show pages.
- [x] **Clean up tags at the same time.** Tag cleanup and the Tag Deck are built (see above); collections can use Fiction, Tone, Era and Setting as well as tags.
- [ ] Later: use the description to sort existing shows into a collection, and to drive "more like this" recommendations.

## Recommendations

- [x] **Quick rating:** uses the existing 1–5 star My rating (4–5 count as liked, 1–2 against) rather than a new field.
- [x] **Suggestions queue (v0.8.0)**, `#/suggestions`, kept off the list: + Add, ✓ Seen it, Not interested (remembered in `state.suggestNo`).
- [x] **Candidates:** TMDB recommendations for your Top 50 / Use to recommend / 4–5 star titles, boosted by favorite actors' credits. Proxy allows `/{tv|movie}/{id}/recommendations` and `/similar`. Not done: discovery by genre or keyword (`/discover`).
- [x] **Ranking:** overlap scoring with a reason per title. Claude ranking not built; **Copy taste profile** is the cheaper paste-into-Claude route.

## New titles

- [x] **Favorite actors' new projects (v0.8.0).** Any refresh of an actor's credits notes new ones (this year or later, or undated) in `actor.news`; Updates has **Check favorite actors for new projects** and a **New from your favorite actors** section with dismiss.
- [ ] Optional: list new and trending titles that fit your collections.

## Open decisions

- [x] **Where suggestions go:** a separate queue.
- [ ] **Claude in the app:** do you want it? It needs an Anthropic API key and costs per use. The cheaper alternative is an "export my taste profile" button to paste into Claude, then importing the results.
- [x] **Viewers:** see collections read-only; Suggestions is owner-only.
- [ ] **Automatic checks:** later, optionally, a nightly check plus phone notifications. That needs a Supabase admin key stored as a secret in Netlify, and machine-generated data would then move to its own tables so a background job can't overwrite your edits. For now, the manual button.

## Device storage (move to IndexedDB)

Today the whole list is one JSON document (~650 KB), kept in one Supabase row and in the browser's localStorage. The browser keeps it twice (the list plus the "last synced" copy that the three-way merge compares against), so it already uses ~1.3 MB of localStorage's ~5 MB per-site cap. The TMDB cache (up to 120 responses, `public/js/tmdb.js`) and the viewer copy share the same space.

The one-document model and the Supabase row are fine for one editor plus viewers; keep them. The problem is localStorage:
- **The cap.** The list, the "last synced" copy and the TMDB cache all share ~5 MB.
- **Silent failure.** `writeBase` in `public/js/cloud.js` swallows errors, so with storage full the "last synced" copy goes stale and the merge compares against an old copy. That could bring back a deleted show or misjudge which edit is newer (possible from the code, not reproduced). Only the main list write warns "storage is full".
- **Blocking saves.** Every edit rewrites the whole 650 KB at once (`writeLocal` in `public/js/state.js`), briefly freezing the page.

### Plan

- [x] **1. Measure (v0.8.0).** Account → Storage on this device shows each localStorage key's size and how much of the list is TMDB-derived, with a downloadable report. Next: read it on your phone and laptop.
- [x] **2. Make storage failures loud (v0.7.22).** When storage is full, saves drop the TMDB cache (and the owner's unused viewer copy) and retry. The TMDB cache is capped at ~1 MB. The "last synced" copy is also kept in memory, so merges stay correct for the rest of the visit, and the sync status shows "⚠ Storage full" with the MB used. Syncing doesn't pause: when the device can't save, the cloud is the only durable copy. Still open: after a reload the merge uses whatever older copy is on the device.
- [ ] **3. Move device storage to IndexedDB (next few weeks, its own release).** Deliberately not bundled into v0.8.0, per this plan. No practical 5 MB cap, saves in the background, stores objects without converting to text. Moves: the list, the "last synced" copy, the viewer copy, the TMDB cache. Small settings (cards/rows) stay in localStorage. Mostly `state.js`, `cloud.js`, `tmdb.js`; startup has to wait for the data before drawing the list. Supabase doesn't change.
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

## Brainstorm

Loose ideas, not planned or decided.

- ~~**Shorter hearted-actor lists on long-running shows.**~~ Built (v0.8.0): past 5 names, one-episode favorites go behind "+N more". Needs each actor's credits refreshed once (opening their page does it) to know episode counts.

## Housekeeping

- [ ] When you add files under `public/js/`, list them in `ASSETS` in `public/sw.js`, and bump `CACHE` together with `APP_VERSION` in `public/js/version.js`.
