# Watch List

A small installable web app for browsing a TV and movie watch list by any column, marking actors you like, and adding the other shows they're in. Built the same way as MedsApp: no build step, Supabase email + password sign-in, one owner who can edit, read-only viewers, hosted on Netlify.

## Features

- **Browse by any column**: the home page lists every column (My status, Want to watch?, Use to recommend, Favorite actors, Format, Genre, Tags, Network, Country, Language, Fiction, Tone, Era, Setting, Decade, Show status, Structure, Episode length, Total time to watch, Seasons, Source, Research confidence) with each value and how many shows have it. Tap one to see those shows.
- **Combine filters**: from a list, **+ Filter** adds any other column. Different columns narrow the list (AND); several values in the same column widen it (OR). Sort by title, year, total time, episode length or seasons. Search titles and notes from the top bar. Every filtered view is a link you can bookmark.
- **Status options** (Account → Status options, or **Edit options** next to My status on Browse): add statuses, rename them (every show with that status follows), pick a color from 10, and reorder by dragging or with the arrows. The order is used in every status menu and on the browse page. A status still in use can't be removed until those shows are changed.
- **Show page**: all the details, quick status / want / recommend pickers, notes, **Edit details** for every research column, and the cast from TMDB.
- **Images**: every title linked to TMDB shows a strip of its main key art (text-free backdrops); tap one for a full-size viewer.
- **Episodes and where you are** (TV shows linked to TMDB): an **Episodes** card lists each season (loaded when you open it; the season you're in opens by default) with every episode's number, air date and runtime. Tap ✓ on an episode to mark everything up to it watched; the header shows **Up next: S2 · E5** with **Watched it**, or "Start with S1 · E1". Catching up on the last aired episode offers to set My status to Finished (show over) or Paused Between Seasons (still running). Episode titles, summaries and stills are spoilers, so they're shown only up to where you are, or for everything when the show's **Show spoilers** switch is on. Statuses marked **Turns on spoilers** in Status options (Finished, Rewatching and Dropped to start) switch it on when you pick them; nothing switches it off except you. Where you are is kept in its own synced map (`state.progress`), so it never collides with edits to the show, and goes in the CSV and sheet as a Progress column.
- **Where to watch** (titles linked to TMDB): the show page and a title's page list where it streams today, by subscription or free, with rent and buy stores collapsed underneath. Plans and resellers are folded into one service (Netflix Standard with Ads → Netflix; HBO Max Amazon Channel → HBO Max, or "Starz (via Amazon)" when that's the only way). This is separate from **Network / platform**, which stays the original network. Data from JustWatch via TMDB.
  - **Where to watch page** (`#/watch`, Account → Where to watch): pick the region (one for the whole list, US to start) and the services you pay for. Yours are highlighted ✓ and listed first on show pages.
  - **Check where to watch** saves where each linked title streams (`show.watch`: service names, plus how many stores rent or sell it), with **Try 10 first**; titles checked in the last 30 days are skipped unless asked. Opening a show page refreshes its saved result once it's over a week old.
  - **Browse**: **On my services** (On my services / Free / Other services / Rent or buy only / Not available / Not checked) and **Where to watch** (by service; subscription and free only). My status = Want to Watch plus On my services = On my services is the "watch tonight" list.
  - **Updates**: **Now on your services** and **Left your services** for titles you mean to watch, when a check finds they moved on or off all of your services.
- **Actors page** (`#/actors`): your favorites, with a search box that filters them as you type and finds other actors on TMDB underneath ("Known for", with titles on your list in bold; acting credits only). The search is kept in the URL, so Back returns to it.
- **Favorite actors**: tap ♡ on anyone in a show's cast. Their filmography is saved with them, so **Favorite actors** works as a browse category ("shows on my list with Jennifer Saunders"). Every show and title also lists the favorite actors in it on a ♥ line: list cards and rows, the show and title pages, Add search results, Updates cards, and an actor's filmography (which names the other favorites in each credit). Past five names, favorites who were in only one episode go behind "+N more".
- **Actor page**: photo, bio, a note on why you like them, and their full filmography with what's already on your list marked. **+ Add** puts a title on your list with the details filled in from TMDB (status Identified, source "Actor: name"). Talk shows and appearances as themself are hidden unless you ask for them. The filmography is sorted **Newest** first, or by **Known for** (how big the part was times how well known the title is, from TMDB's vote count), and each credit is tagged Recurring (2+ episodes) or Guest for TV, Lead (billed top 3), Supporting (top 8) or Small role for movies. **Major roles only** hides guest spots and small parts. **Seen** and **Plan to see** above the filmography answer "which of these have I seen?" in one tap, with counts: Seen is the statuses that turn spoilers on plus Watching and Some; Plan to see is Want to Watch, Restart Planned and Waiting on Release and Now It's Ready.
- **✓ Seen it**: beside every **+ Add** (Add page results, a title's page, actor filmographies, Suggestions) adds the title as Finished in one tap, with Show spoilers on for TV and Undo in the toast. If Finished has been renamed or removed, the first status that turns spoilers on is used.
- **Recent** (top bar): the last 30 shows, TMDB titles and actors you opened, newest first, with **Clear** (and Undo). Kept on each device only, so it doesn't sync and opening a page never triggers a sync; cleared on sign-out. Deleted shows drop out, and a title you've since added shows as the show on your list.
- **Add a show**: search TMDB (results appear as you type; **Show more** for the next page). **+ Add** puts a title on your list as Identified with years, seasons, episodes, runtime, genres, network, country, language and show status filled in, with **Undo** in the toast; tap a result to see its details first. Results already on your list say so with their status. If an unlinked show on your list has the same title and a year within one, the result says "Might be on your list" and offers **Link** (connects that show to TMDB and fills its blanks) or **Add anyway**; a title's own page (for example from an actor's filmography) gives the same warning. A search of your list that finds fewer than three shows offers **Search TMDB for "…"**, and `#/add?q=…` links can be bookmarked. Titles not on TMDB can be added by hand.
- **Updates** (TV shows linked to TMDB): **Check N shows** asks TMDB whether each show was renewed, canceled or ended and whether a new season is out. What TMDB says is stored separately from your own **Show status** label and never overwrites it. The page lists shows you were waiting on that are now ready, shows you finished that have a new season coming or out (with a **Waiting for next season** button that sets the status to Paused Between Seasons), what changed since the last check, and labels that disagree with TMDB, each with one-tap fixes or **Dismiss** (hidden until TMDB says something new). A show's page has its own **Check for updates** button. Finished shows that TMDB already has as ended or canceled are rechecked once a month rather than every run. Shows you're partway through say how many episodes came out since where you are and where to resume. **Check favorite actors for new projects** looks up their credits again and lists anything new (this year or later, or not dated yet) under **New from your favorite actors**, with dismiss per title. Shows TMDB has confirmed as over are skipped unless you ask, except Finished shows, which are always checked so a revival isn't missed.
- **Fiction, Tone, Era and Setting**: four fields every show has. Fiction is Scripted, Based on a true story, Documentary, Reality or Stand-up / variety; Tone is Light, Mixed or Dark; Era is Present day, a decade, Before 1900 or Future; Setting is a list of places, most specific first (Brooklyn, not US). Browsing by Setting rolls places up, so a show set in Brooklyn also counts under New York City, New York and US.
- **Fill from TMDB** (Account → TMDB): fills those four fields for linked shows, plus Country and Language where blank. Fiction comes from TMDB genres and keywords; Tone from TMDB's mood keywords (hilarious, feelgood, depressing, sinister…), falling back to genres (pure comedy or family → Light, horror → Dark); Setting and Era from Wikidata's "narrative location" and "set in period" first, then from TMDB keywords that name places ("london, england") or periods ("1980s", "world war ii", "1950s japan", "late 19th century", "edo period", or a year range in brackets such as "the troubles (north ireland, 1966-98)"). A period longer than about three decades gives no era, and a broad keyword gives way to a narrower one ("space race" next to "1960s" gives 1960s). When nothing says otherwise, Era is guessed as Present day and marked "guess"; it isn't guessed for period pieces, true stories, documentaries, sci-fi, fantasy, westerns, or shows with a keyword naming a period that ended before they came out (Cold War, The Troubles). TMDB's keywords are saved with the rest (`show.sourced.keywords`), apart from your tags; the Tag Deck uses them for suggestions instead of asking TMDB again. What the sources said is stored apart from your own values (`show.sourced`), the same way TMDB show status is: your value wins whenever you set one, setting a field back to what the sources say makes it follow them again, and a later fill never overwrites you. **Try 10 first** runs a small batch, and the page reports where each answer came from.
- **Tag cleanup** (`#/tags`, Account → Tags, or **Clean up** next to Tags on Browse): one tap merges tags that differ only in capitals, hyphens or spaces; removes tags that repeat a genre the show already has (or turns them into the genre); moves Fiction and Tone tags (True Story, Docuseries, Stand-up, Cozy…) into those fields; asks about ambiguous ones (Spanish: Country, Language or Setting?); removes setting, era and origin tags in one go (origin and decade tags fill Country or Era where blank first; place tags are deleted); renames or merges any tag across every show; and lists one-off tags with Merge into a similar tag / Keep / Delete. Every bulk change has **Undo**.
- **Tag Mode** (`#/tags/mode`, or **Find more shows for …** on a list filtered by one tag): pick a tag and go through shows that might fit it, best guesses first (a TMDB keyword matching the tag, tags and genres that tend to go with it on shows that have it, favorite actors in common), each with the reason. Right adds the tag, left is no; no's are remembered per tag (`state.tagNo`) so they aren't asked again, with **Forget** to clear them.
- **Collections** ("my type of sitcoms"): a name, a description in your words, an optional saved filter, and titles added or left out by hand. Filter a list and tap **Save as collection** (or replace an existing collection's filter), or start one from **Collections** on the home page, where they show above the browse columns. A show's page lists its collections, with **+ Add to…**. Viewers see them read-only.
- **Suggestions** (`#/suggestions`): titles you might like, kept apart from your list. **Find suggestions** looks at TMDB's recommendations for the titles you rate highest (Top 50, Use to recommend, 4–5 stars; Dropped and 1–2 stars count against) and your favorite actors' credits, and ranks by how many of your favorites lead to each title. Each has **+ Add** (as Want to Watch), **✓ Seen it** and **Not interested** (remembered). **Copy taste profile** copies a summary of your taste to paste into Claude for more ideas.
- **Tag Deck** (`#/tags/deck`, or **Review tags for these N shows** on any filtered list): one card per show with its fields at the top as one-tap pickers (blank ones highlighted, values from TMDB/Wikidata marked), its tags as chips (tap to remove, tap again to restore), suggested tags (common on similar shows by genre and favorite actors, plus TMDB keywords that match an existing tag), and an add box that autocompletes and asks "Did you mean…?" before creating a near-duplicate. Swipe right or press → to save and move on; swipe left or ← to skip (the show comes back at the end); **Undo** puts the last card back. Nothing changes until a card is saved. Shows with no tags or only one-off tags come first, then Top 50 and Use to recommend. Saving records the date on the show, and the deck shows how many of your shows are reviewed.
- **Link your list to TMDB** (Account → TMDB): matches every title automatically when the title and year agree, and lists the unsure ones for you to pick (or mark "Not on TMDB").
- **Google Sheet export**: **Update Google Sheet** overwrites a "Watch list (app)" tab in your spreadsheet with the current list. Your original tab is never touched, and sheet edits don't flow back.
- **Backups**: CSV download, JSON backup and restore. Account → **Storage on this device** shows what the app keeps in the browser and how much of the list is TMDB-derived.
- Syncs between devices, works offline, dark mode, installable on a phone (Add to Home Screen).

## Data cleanup done on import

`tools/import_sheet.py` turned the sheet into `data/seed.json`:
- one Format and one Release Year (the researched columns, with the provisional ones as fallback)
- the broken `#REF!` column dropped; the app works out total hours itself (episodes × episode length)
- "Want to Watch?" values became Yes / Maybe / Once it's finished / A lot
- Genre, Tags and Source became lists; "Country / Language" split into country and languages

To re-import after changing the sheet: export the tab's values to `data/sheet-export.json`, run `python3 tools/import_sheet.py data/sheet-export.json data/seed.json`, and import the new seed in the app (this replaces what's in the app).

## Setup

### 1. Supabase (new project)
1. Create a new project at supabase.com.
2. SQL Editor → New query → paste `supabase/setup.sql` → Run.
3. Authentication → Sign In / Providers: turn off **Allow new users to sign up**.
4. Authentication → Users → **Add user → Create new user** for yourself (auto-confirm, with a password). Do the same later for anyone you want to share with.
5. Project Settings → API: copy the **Project URL** and the **publishable key**.
6. The owner (editing) account is `stephanie@bostonprivatetutors.com`. To use a different account, change it in `supabase/setup.sql` (`watchlist_is_editor`) and in `public/config.js`.

### 2. TMDB
1. Make a free account at themoviedb.org → Settings → API → request an API key (personal use).
2. Copy the **API Read Access Token** (the long one).

### 3. GitHub + Netlify
1. Put the Supabase URL and publishable key into `public/config.js`.
2. Push this folder to a new private GitHub repo.
3. Netlify → Add new site → Import from GitHub → pick the repo. Settings come from `netlify.toml` (publish `public/`, functions in `netlify/functions`).
4. Site configuration → Environment variables:
   - `TMDB_TOKEN`: the TMDB API Read Access Token
   - `SUPABASE_URL`: the project URL
   - `SUPABASE_KEY`: the publishable key
   - `OWNER_EMAIL`: your sign-in email
   - `SHEET_SCRIPT_URL` and `SHEET_SCRIPT_SECRET`: from step 4
5. Redeploy.

### 4. Google Sheet export (optional)
1. Open the spreadsheet → Extensions → Apps Script. Replace the code with `apps-script/Code.gs`.
2. Set `SECRET` to a long random string (the same value goes in Netlify as `SHEET_SCRIPT_SECRET`).
3. Deploy → New deployment → Web app, Execute as **Me**, Who has access **Anyone**. Authorize it, and copy the web app URL into Netlify as `SHEET_SCRIPT_URL`.

### 5. First run
1. Open the site → ☰ → sign in.
2. **Import backup…** → pick `data/seed.json`. It syncs to Supabase.
3. ☰ → TMDB → **Link titles** → **Match**. Pick the unsure ones as you go; the rest can wait.

## Run it locally

```sh
python3 -m http.server 8000 --directory public
```

TMDB lookups go through the Netlify function, which doesn't run under a plain file server. For local testing, put a TMDB read token in `tmdbDevToken` in `public/config.js` (don't commit it), or use `netlify dev`.

## Files

- `public/index.html`, `public/styles.css`: the page and its styles
- `public/js/`: the app, as native ES modules (no build step). `main.js` starts everything.
  - `state.js`: the list, loading, saving; `shows.js`: facts worked out from a show; `categories.js`: browse columns, filters, sorting
  - `router.js`: hash routes and rendering; `ui.js`: shared pieces (show cards, status menu, TMDB search)
  - `tmdb.js`: TMDB lookups and caching; `images.js`: backdrops, Show spoilers switch and episode stills; `library.js`: changes that come from TMDB (link, fill in, add, favorite actors)
  - `sources.js`: turns TMDB details/keywords and Wikidata answers into Fiction, Tone, Setting, Era (pure functions); `wikidata.js`: Wikidata queries (straight from the browser; query.wikidata.org allows it); `fill.js`: the Fill from TMDB run
  - `tagrules.js`: which tags belong in fields, duplicate spellings, "did you mean"; `facts.js`: TMDB show status kept apart from your label
  - `views/`: one file per page; `cloud.js`: sign-in, sync and sharing (adapted from MedsApp)
- `public/config.js`: Supabase project URL, publishable key, owner email
- `public/sw.js`: offline cache (bump `CACHE` with `APP_VERSION` in `js/version.js` when you change files, and add any new file to `ASSETS`)
- `netlify/functions/tmdb.mjs`: TMDB proxy (keeps the token secret; signed-in users only; only the lookups the app uses, including keywords, where to watch and recommendations)
- `netlify/functions/sheet-export.mjs`: sends the list to the Apps Script (owner only)
- `netlify/lib/auth.mjs`: checks the Supabase sign-in for both functions
- `apps-script/Code.gs`: writes the export into the spreadsheet
- `supabase/setup.sql`: tables and access rules
- `data/seed.json`: your list as imported from the sheet (not published on the site)
- `tools/import_sheet.py`: sheet → seed.json

Show data and images come from TMDB. This app uses the TMDB API but is not endorsed or certified by TMDB. Setting and era data also come from Wikidata (CC0).
