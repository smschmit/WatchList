# Notes for Claude

## Merging and version numbers

Whenever the user asks you to merge (a PR or a branch into `main`), end your reply by stating the
version number the app should now show once Netlify has deployed `main`:

- The number is `APP_VERSION` in `public/js/version.js` as it stands on `main` after the merge
  (it appears in the app's Account view).
- Read it from the merged `main`, not from memory or the branch you were on.
- If the merge changed shipped files but `APP_VERSION` (and `CACHE` in `public/sw.js`) were not
  bumped, say so plainly, since the app will keep showing the old number and may serve stale cached files.
- If you can't confirm the deploy finished, give the number and say it applies once the deploy completes.

## User shorthand

- **push to next** / **merge to next**: merge the current work into the `NextVersion` branch (create it
  from `main` if it doesn't exist) and push it. This is not a merge to `main`.
- **concat**: show the full, final text of what we've been writing in one copyable block, with all
  edits applied. No commentary inside the block.
- **fetch todo**: read `TODO.md` from the repo (latest `main` unless told otherwise) and show the open items.
- **add todo [info]**: add the item to `TODO.md` under the section it fits (or **Next up**), matching the
  existing `- [ ] **Title.** detail` style, then commit and push.
- **ship it**: merge `NextVersion` into `main` and push. Before merging, if `APP_VERSION` in
  `public/js/version.js` and `CACHE` in `public/sw.js` weren't bumped since the last release, bump both
  (patch number, e.g. 0.7.23 → 0.7.24, unless the user names a version). Then report the version as
  described under "Merging and version numbers".
- **done todo [item]**: tick the matching item in `TODO.md` (`- [ ]` → `- [x]`), add a short "Done." note
  if useful, then commit and push. If more than one item could match, ask which.
- **status**: report the current branch, any uncommitted changes, which commits are on `NextVersion` but
  not on `main`, and the current `APP_VERSION` on `main` and on `NextVersion`.
- **what changed**: a short plain-English summary, like release notes, of what's on `NextVersion` that
  isn't on `main` yet (what's not live). Describe features and fixes, not file names.
- **check it**: run the app and screenshot the views affected by the latest change to confirm it works.
  Say plainly if something looks wrong or couldn't be checked.
- **park it**: commit all current work, even if unfinished, with a "WIP: ..." message, and push it to this
  session's own branch (never `NextVersion` or `main`). Reply with the branch name and a one-line note
  on where things stand so a later session can resume.

## Instructions for the user

- Whenever you give the user steps to follow, include the direct URL wherever one exists (e.g. the
  GitHub page, Netlify page, Notion page, or settings page), not only a description of where to click.
