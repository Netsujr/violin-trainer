# Violin trainer: rules for coding

Read this file before making any change, and follow it.

## Working with the user

- **Don't run any tests** (unit or browser, targeted or full) unless the user asks for a run. Write or update tests to match a change, but don't run them.
- **Never commit or push** unless told to, every time. Leave changes local so the user can see them.
- **Stay in scope.** Build only what was asked. Offer extras in one line, and don't build them.
- **Short answers.** Under 100 words where possible. Say what was skipped and what is still unchecked.
- **Don't build parked ideas** unless asked: Align as its own screen, and listen-to-draft in Add piece.
- **The user changes direction mid-task.** Apply the latest message, and drop work it makes unnecessary. Don't finish the old plan first.
- The user's dev server runs on port 5173. Don't stop or restart it.

## Code

- TypeScript, Vite, Pico CSS, no framework. Build the DOM with `h()` from `src/ui/dom.ts`.
- **Reuse before writing.** Check for an existing helper first, such as `confirmAction`, `boxToggle`, `createIconToggle`, the icons in `toggles.ts`, `fillFingering`, `noteLabels` or `meterOf`. Add no new dependency for what a few lines can do.
- **The simplest thing that works.** No abstraction with one user, no options nobody asked for, and no code kept "for later". Delete what a change makes unused, including strings, CSS, settings and tests.
- Keep files to about 250 lines. Split a file by feature when it grows past that.
- Settings live in the `Settings` type and `DEFAULT_SETTINGS` in `src/storage.ts`. When a stored shape changes and existing data would be lost, migrate it in `getSettings()`.
- **Match the existing style.** Double quotes, semicolons, long lines (about 160 characters). There is no Prettier config, so **don't run Prettier**. It rewraps whole files at 80 columns.
- **Comments are plain English** and say what something does for the player, or why. Write them as sentences, and don't narrate the code.

## UI

- **Hide what doesn't apply.** Don't grey it out.
- Keep controls compact. Prefer small icon toggles and single buttons that step through choices over large panels.
- Ask before anything that can't be undone, with `confirmAction`.
- Every string goes in `src/i18n.ts` in **both English and Portuguese**.
- The layout must work at phone width (about 400px).

## Music content

- Built-in songs (`src/content/pieces/*.json`) use only beginner fingers 0, 1, 2 and 3 (2 means high 2). Each subtitle names the key and the strings used. Set `beatsPerBar` and `pickup` when a song isn't in 4/4.
- **No copyrighted music in the repo** or as a built-in piece. A piece the user owns goes into their own browser storage only.

## Tests (only when the user asks for a run)

- Unit tests: `npm test` (vitest, files in `test/`).
- Browser tests: `node e2e/<name>.mjs`, against a Vite server on port 5199 (`npx vite --port 5199 --strictPort`). Run only the files covering what changed. Each file exits 0 even when a check fails, so search the output for `FAIL`.
- Browser tests check what the user sees. Seed state with `seed()` from `e2e/lib.mjs`, not by reaching into the code.
