# Watch List

A small installable web app for browsing a TV and movie watch list by any column, marking actors you like, and adding the other shows they're in. Built the same way as MedsApp: no build step, Supabase email + password sign-in, one owner who can edit, read-only viewers, hosted on Netlify.

## Features

- **Browse by any column**: the home page lists every column (My status, Want to watch?, Use to recommend, Favorite actors, Format, Genre, Tags, Network, Country, Language, Decade, Show status, Structure, Episode length, Total time to watch, Seasons, Source, Research confidence) with each value and how many shows have it. Tap one to see those shows.
- **Combine filters**: from a list, **+ Filter** adds any other column. Different columns narrow the list (AND); several values in the same column widen it (OR). Sort by title, year, total time, episode length or seasons. Search titles and notes from the top bar. Every filtered view is a link you can bookmark.
- **Show page**: all the details, quick status / want / recommend pickers, notes, **Edit details** for every research column, and the cast from TMDB.
- **Favorite actors**: tap ♡ on anyone in a show's cast. Their filmography is saved with them, so **Favorite actors** works as a browse category ("shows on my list with Jennifer Saunders").
- **Actor page**: photo, bio, a note on why you like them, and their full filmography with what's already on your list marked. **+ Add** puts a title on your list with the details filled in from TMDB (status Want to Watch, source "Actor: name"). Talk shows and appearances as themself are hidden unless you ask for them.
- **Add a show**: search TMDB and pick it; years, seasons, episodes, runtime, genres, network, country, language and show status fill in. Titles not on TMDB can be added by hand.
- **Updates** (TV shows linked to TMDB): **Check N shows** asks TMDB whether each show was renewed, canceled or ended and whether a new season is out. What TMDB says is stored separately from your own **Show status** label and never overwrites it. The page lists shows you were waiting on that are now ready, what changed since the last check, and labels that disagree with TMDB, each with one-tap fixes or **Dismiss** (hidden until TMDB says something new). A show's page has its own **Check for updates** button. Shows TMDB has confirmed as over are skipped unless you ask.
- **Link your list to TMDB** (Account → TMDB): matches every title automatically when the title and year agree, and lists the unsure ones for you to pick (or mark "Not on TMDB").
- **Google Sheet export**: **Update Google Sheet** overwrites a "Watch list (app)" tab in your spreadsheet with the current list. Your original tab is never touched, and sheet edits don't flow back.
- **Backups**: CSV download, JSON backup and restore.
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
  - `tmdb.js`: TMDB lookups and caching; `library.js`: changes that come from TMDB (link, fill in, add, favorite actors)
  - `views/`: one file per page; `cloud.js`: sign-in, sync and sharing (adapted from MedsApp)
- `public/config.js`: Supabase project URL, publishable key, owner email
- `public/sw.js`: offline cache (bump `CACHE` with `APP_VERSION` in `js/version.js` when you change files, and add any new file to `ASSETS`)
- `netlify/functions/tmdb.mjs`: TMDB proxy (keeps the token secret; signed-in users only; only the lookups the app uses)
- `netlify/functions/sheet-export.mjs`: sends the list to the Apps Script (owner only)
- `netlify/lib/auth.mjs`: checks the Supabase sign-in for both functions
- `apps-script/Code.gs`: writes the export into the spreadsheet
- `supabase/setup.sql`: tables and access rules
- `data/seed.json`: your list as imported from the sheet (not published on the site)
- `tools/import_sheet.py`: sheet → seed.json

Show data and images come from TMDB. This app uses the TMDB API but is not endorsed or certified by TMDB.
