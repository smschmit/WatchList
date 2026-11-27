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
