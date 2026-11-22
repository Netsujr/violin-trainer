# Stage redesign: implementation plan

The design is the "Whole app" page of the Listen overhaul canvas:
https://claude.ai/code/artifact/d5e9d2e4-1904-486e-ba14-f803096e209c

This plan turns it into code, one phase at a time. Each phase leaves the app working, so it can be checked and committed
on its own (only when asked). CLAUDE.md still applies throughout: no tests run unless asked, every string in English and
Portuguese, `confirmAction` before anything that can't be undone, files around 250 lines, no Prettier.

## Decisions to confirm first

1. **Fonts.** Barlow (400, 500, 600, 700) and Barlow Condensed (600). Recommended: the woff2 files in `src/assets/fonts`
   with `@font-face`, like Bravura, so the app keeps working offline. The other choice is a Google Fonts link in
   `index.html`. Either way, no new npm dependency.
2. **Colours that carry meaning.** In tune turns blue instead of green, and close enough turns brass instead of yellow,
   on the dial, the staff's played notes and the fingerboard. Hit notes on the lanes become pale blue. Missed notes keep a
   muted red, because red still reads as missed.
3. **New features, not just restyling:** the "You're playing" note readout, the tuner and fingerboard panels in
   Practice, the panels' big/small/off sizes, and the Today button in Calendar.
4. **The sidebar stays a `<header>`** holding a `<nav>` of `<button>`s. That keeps the browser tests' `nav button`,
   `nav button[aria-current="page"]` and `header .metronome-button` selectors working.

## The design in numbers

- Colours: ground `#0F131A`, sidebar `#0B0E13`, panels `#171D27`, settings panel `#131821`, lines `#222A37` and
  `#2C3442`, text `#E8ECF2`, muted text `#98A2B3` and `#8590A2`, brass `#E6AE48` (dark text `#1A1405` on it), dim brass
  `#3A3220`, blue `#6CC4FF` (light blue `#9ED8FF` for small text), record red `#E5484D`.
- Type: Barlow for everything, Barlow Condensed 600 for screen titles, the app name and the note readout.
- Sizes: Start 44px tall, other action buttons 40px, the settings panel's buttons 36px, sidebar items 48px. Icon-only
  buttons are 40px square.
- Controls: options are joined segments (one bar, a thin `#0F131A` line between buttons, the one picked solid brass).
  On/off switches inside a group are joined too. Panel buttons step big (solid brass), small (dim brass), off (plain).
- Icon only for icons everyone knows: + for add, full screen, back, previous and next, a bin for delete or clear. Every
  other control shows its words. No control relies on a tooltip; icon-only buttons have an `aria-label`.
- Layout: a 272px sidebar (76px with icons only) beside the screen. On screens that scroll, the sidebar stays fixed and
  scrolls by itself only when its own list is long. Listen and Practice fill the window: a title row on top, the panels
  in the middle taking whatever height is left, and the settings panel docked at the bottom, never moving.
- At 900px and narrower the sidebar becomes a bar across the top, and its sub-items scroll sideways.

## Phase 1: theme and sidebar

**Build**
- `src/style.css` is 2974 lines and most of it gets rewritten, so split it by feature as it changes:
  `src/styles/base.css`, `shell.css`, `listen.css`, `practice.css`, `library.css`, `calendar.css`, `progress.css`,
  `settings.css`, each imported in `main.ts`. Start with `base.css` (the colours above as Pico variables, replacing the
  warm `[data-theme="dark"]` block) and `shell.css`. Drop the `#app` 960px cap.
- `src/main.ts` `renderHeader()` builds the sidebar: the app name and the shrink/expand button, the nav buttons with an
  icon and a word each, a slot under the current screen's button for its sub-items, then Record, Metronome and Settings
  at the bottom with EN | PT beside Settings. The Settings popup's close-on-outside-press code goes (lines 86 to 93).
- `src/ui/dom.ts`: `Screen` gains `sidebar?: HTMLElement`, the sub-items a screen shows under its nav button (Listen's
  modes, today's plan, Library's groups). `main.ts` puts it in the slot.
- `src/storage.ts`: `sidebarIcons: boolean`, default `false`.
- `src/ui/runControls.ts` `createRecordToggle()` and `src/ui/practice/options.ts` `createMetronomeButton()` show their
  word ("Record", "Metronome 60") beside the icon, keeping the BPM slide, the wheel and the arrow keys.
- Strings: shrink and expand the sidebar.

**Check**: every screen at 1440×900, 1180×820, 820×1180, 390×844 and 320×568. The sidebar full and icons only, the current
screen marked, the phone top bar wrapping cleanly, Record arming, the metronome's slide still changing the BPM.

**Tests**
- `e2e/screens.mjs`: `fillsWidth` assumes the 960px cap. Measure against the room beside the sidebar instead.
- `e2e/lib.mjs`: `setBpm` and `setRecord` keep working if the classes stay. Add `setLanguage(page, "PT")` and
  `openSettings(page)` here now, for phase 2.
- `test/storage.test.ts`: the new default.

## Phase 2: Settings as a screen

**Build**
- `src/ui/settings.ts` becomes `settingsScreen()`: Tuning (the dial preview with both ranges drawn, In tune, Close
  enough on/off with its slider hidden when off), Listening (Hold time, Mic sensitivity), Your data (Back up, Restore,
  Storage used). Add "Settings" to `SCREEN_NAMES` in `main.ts`, shown at the bottom of the sidebar rather than in the
  top group. Language moves to the sidebar's EN | PT.
- `src/ui/needle.ts` becomes the dial: an SVG arc from 50 cents flat to 50 cents sharp, the in-tune arc blue and the
  close-enough arc brass, both drawn from `greenCents` and `passCents()`. Keep `.needle` and `data-zone` on it. Listen
  uses it already through `createNeedle()`, and Settings uses it as the preview.
- `src/ui/calendar.ts`: remove the storage row. `src/ui/backup.ts` moves to the Settings screen unchanged.
- Strings: Tuning, Listening, Your data, the captions, "Used everywhere the app checks your tuning", On and Off, the
  preview's key ("In tune: within 10 cents"). Delete the zone tooltips.
- CSS: delete the gear, the hanging panel and the zone cells (style.css lines 129 to 260), and write `settings.css`.

**Check**: Settings at all sizes. Dragging a slider moves the dial's arcs as you drag. Close enough off hides its slider
and its arc. Switching language stays on Settings. Back up downloads, and Restore asks first.

**Tests**
- Every `page.click("header summary")` followed by `.language button` becomes `setLanguage()`: `language.mjs`,
  `calendar.mjs`, `follow.mjs`, `fullscreen.mjs`, `library.mjs`, `pieces.mjs`, `screens.mjs`, `section.mjs`.
- Settings sliders reached through `header summary` and `label.setting` move to `openSettings()`: `played.mjs`,
  `flows.mjs`, `listen.mjs` (Close enough becomes an On/Off pair, so `button[aria-label="Close enough"]` changes).
- `flows.mjs`: `.calendar-storage` is now on Settings.
- `screens.mjs`: the "Settings open" audit audits the Settings screen.

## Phase 3: Listen

**Build**
- Split `src/ui/listen.ts` (already 263 lines): `listen.ts` keeps the wiring (modes, reading the mic, the run),
  `listenStage.ts` the panels and the tuner, `listenDock.ts` the settings panel.
- The modes move to the sidebar as `screen.sidebar`: each a name and a one-line description. The title row shows the
  mode's name, the guesser's "3 of 10 right", Progress (with its word), Full screen (icon) and Start.
- Panels: Staff and Fingerboard step big, small, off. Big ones take a row each, small ones share a row, and with no big
  one they stack. One always stays on. The tuner (the dial plus the "You're playing" note, its Do Ré Mi name and Hz)
  switches on and off in its own column on the right. Put the shared stepping and the grid rows in
  `src/ui/panels.ts`, used here and in Practice.
- `src/ui/fingerboard.ts` is drawn across the screen: nut on the left, E at the top, G at the bottom. Swap the axes in
  `pointOn`, the board, the strings and the tapes, and drop the scroll head. Keep `boardShare`, the target, the heard
  ghost and the hint, recoloured (target brass, heard blue). The Finger tapes switch stays, as a small worded toggle in
  the panel's corner.
- The settings panel, in one wrapping row: On the notes (Fingers, Do Ré Mi, A B C as a joined group, replacing the
  icon toggles in the staff's corner), On screen, then the mode's own settings.
  - `src/ui/guesser.ts`: Eye and Ear as a joined pair with no caption, the level as three buttons with its hint under
    them, notes at a time joined. The score moves to the title row.
  - `src/ui/technique.ts`: notes per bow, string and beats as joined groups. The pause switch moves from the staff's
    corner to the panel as "Before each note", still only shown for one note a bow.
  - `src/ui/freeTarget.ts`: the speaker in the staff's corner becomes the panel's Sound toggle.
- Full screen: the panels with Start/Stop and Exit only, plus the score in the guesser.
- `src/storage.ts`: `listenPanels: { staff, board: "big" | "small" | "off"; tuner: boolean }`, replacing `listenView`.
  Migrate in `getSettings()`: staff → staff big, board off; both → staff big, board small; board → staff off,
  board big; the tuner on, since the needle always shows today.
- `src/ui/toggles.ts`: `createIconToggle` becomes a worded toggle. Delete the icons nothing uses any more:
  `MUSIC_ICON`, `GUESS_ICON`, `BOWING_ICON`, `STAFF_AND_BOARD_ICON` and `FINGERBOARD_ICON` if the sidebar doesn't use
  them.
- Strings: the mode descriptions, On the notes, On screen, Staff, Fingerboard, Tuner, "You're playing", screen-reader
  states ("Staff: big"), "Before each note", "Play the note I pick". Delete `listenViews` and the long `guessBy` texts.
- CSS: delete Listen's old rules (style.css lines 497 to 830, and Listen in fullscreen from line 1873) and write
  `listen.css`.

**Check**: each mode. The panels at least as: the default, staff only, fingerboard only, both small, tuner off. By eye
and by ear (the note and its finger hidden by ear). Technique's pause only at one note a bow. Free play's tap to pick and
its faint preview. Full screen. Portuguese, whose labels are longer. Phone and tablet sizes.

**Tests**
- `listen.mjs`: stepping `.listen-view`, `.stage-sheet`, the tapes switch, the needle's zone and the button order
  (`.listen-start`, `.listen-view`, Fullscreen) all change.
- `modes.mjs`: the modes are found by `button[aria-label="${mode}"]`. They become sidebar buttons with visible names.
- `screens.mjs`: Listen's audits.
- `test/storage.test.ts`: the `listenView` migration, all three values.
- `test/fingerboard.test.ts`: only if `boardShare` or the exported geometry changes.

## Phase 4: Practice

**Build**
- `src/ui/practice/index.ts`: add the Fingerboard panel (the note to play now in brass, the next finger as a dashed
  ring) and the tuner, fed from `onReading` with the current target, the same calls Listen makes
  (`board.show`, `board.hear(frequency, passCents())`, the dial from the cents off the target).
- Title row: the piece's name, its subtitle and "Note 1 of 15", a section's "Notes 3 to 5" when there is one, the score
  after a run. Then Change piece (the piece menu, with its word), Hear the note (the reference tone, with its word), Full
  screen (icon), Start. The run summary line (`.mode-note`, "Waits for each note · Plays once") goes, since the settings
  now show their words.
- Panels: Lanes, Staff and Fingerboard step big, small, off, through `panels.ts`. The tuner switches on and off.
  Small ones sit two to a row under the big ones. The staff's ▾ (one moving line or the whole sheet) stays, as an icon
  in the staff panel's corner.
- The settings panel (`practiceDock.ts`, split out of `practiceControls.ts`): On the notes and On screen (moved off
  the lanes' bar), Pace (Wait for me / Keep moving, `followOn`), Repeat (Once / Loop), Top note (Once / Twice, scales
  only), Pattern (scales only), Count-in as − value + over Off, 2, 4, 6, 8 and 10, and Glide (`tempoOn`). Keep today's
  rules for what's hidden: with a backing track, no Pace, Glide or Count-in; with Keep moving, no Glide or Count-in.
- `src/ui/practice/todayPlan.ts`: the drawer becomes the sidebar list, one row a piece: its name, "4/10 min" and a thin
  bar, brass until done and then blue, with "1 of 6 done" above. Picking a row opens the piece. A long plan scrolls
  inside the sidebar.
- Full screen (`src/ui/practice/fullscreen.ts`, `practiceControls.ts`): the panels as set, with Start/Stop, Hear the
  note and Exit only. The code moving the label switches and the speed in beside the buttons goes.
- Colours drawn in code: `src/ui/highway.ts` (dark tiles with light text, the current tile brass, hits pale blue,
  misses muted red, lanes and lines in the new greys), `src/ui/staff.ts` (light notes and lines on the dark panel, the
  played notes blue when in tune), `src/ui/staffTrace.ts`, `src/ui/waveform.ts`.
- `src/ui/practice/backingTrack.ts`, `trackAlign.ts`, `results.ts`, `pieceMenu.ts`: restyle. A track's speed shows in
  the title row while a track is on.
- `src/storage.ts`: `practicePanels: { lanes, staff, board; tuner }`, replacing `staffBig` and `staffOnly`. Migrate:
  neither → lanes big, staff small; `staffBig` → staff big, lanes small; `staffOnly` → staff big, lanes off. The
  fingerboard off and the tuner off for everyone. Delete `todayPlanOpen`. New recordings still save a
  `RecordingView` worked out from the panels (staff only when the lanes are off), so older ones read the same.
- Strings: Pace, Wait for me, Keep moving, Each note waits until you play it, Follow along and get a score at the end,
  Repeat, Once, Loop, Top note, Twice, Count-in, Off, "4 beats", Glide and its caption, Change piece, Hear the note,
  Lanes. Delete the run-summary strings, `lanesAndStaff`, `biggerStaff`, `staffOnly`, `dontWaitHint` and `tempoHint`
  if unused.

**Check**: a scale and a song (Top note and Pattern only on the scale). With and without a backing track, and lining a
track up. Keep moving with its score at the end. Loop. Picking a section by clicking notes. The panels in their main
combinations. Today's plan picking a piece. Full screen. Phone and tablet sizes.

**Tests**
- `practice.mjs`: "Practice has no needle" becomes "the tuner is off by default"; the view button goes.
- `follow.mjs`: the Don't wait checks expect an icon (`innerText() === ""`) and the Lanes and staff button.
- `pitchline.mjs`: finds the view by its three labels.
- `tempo.mjs`: Tempo and the count-in on `.section-bar`.
- `section.mjs`, `sections.mjs`: `.mode-note` and the `.section-bar` label switches.
- `calendar.mjs`: today's plan as a drawer that stays open or closed.
- `fullscreen.mjs`: which controls show in full screen.
- `track.mjs`: where the speed control sits.
- `follow.mjs`, `practice.mjs`, `pieces.mjs`, `qa.mjs`: `canvasHasColor` looks for today's tile, hit, miss and bar-line
  colours. Update the RGB values.
- `e2e/lib.mjs`: `progress()`, `trackNotes` and `followNotes` read `section > p` for "Note 1 of 15". Keep that line a
  `<p>` that's a child of the section, or give it a class and update the three helpers. `setCountIn` steps `.count-in`
  through its label, which becomes the stepper.
- `test/storage.test.ts`: the `staffBig`/`staffOnly` migration.

## Phase 5: Library and Add piece

**Build**
- `src/ui/library.ts`: the groups move to the sidebar with their counts, and the screen shows one group whole, so the
  "Show 14 more" drawers go. Title row: the group's name and count, Progress (with its word) and + (Add piece). Each
  piece is a card: the title (still the button that marks it for practice), its subtitle, when it was last practised,
  then worded buttons: Practise, PDF (not on scales), the track buttons, and Edit and Delete on your own pieces.
- `src/ui/libraryTracks.ts`: Add track, Line up and Remove track, with their words.
- Add piece becomes its own screen, `src/ui/addPiece.ts`, not in the menu. It opens from + and from Edit, with a back
  button. Title row: back (icon), "Add piece" or "Edit piece", Clear, Save piece. The title field, then the staff
  filling the space.
- `src/ui/pieceEditor.ts` (already 382 lines): split the sheet from a new `noteTools.ts`, the docked bar for the
  selected note: its name and bar, Beats, Sharp or flat, Hear this line, Add a rest, Delete note (bin). The controls
  under each column go.
- Strings: "17 pieces", Practise, PDF, Add track, back to a group, Selected note, "Mi (E), bar 2", the title's
  placeholder.

**Check**: each group. Marking for practice. PDF. Adding, lining up and removing a track. Editing a piece and the "discard
your changes?" question. Save and Clear. The editor at phone width, and a long title.

**Tests**
- `library.mjs`: `.library > div` groups, `.library h3` and the drawers.
- `pieces.mjs` (601 lines, the biggest change): the editor's per-column controls move to the docked bar.
- `track.mjs`: the track buttons.
- `progress.mjs`: the "Classic tunes: progress" button becomes Progress in the title row.
- `screens.mjs`, `qa.mjs`.
- `e2e/lib.mjs`: `openDrawers` goes. `saveStaff` finds Save piece in a `.row`, now in the title row.

## Phase 6: Calendar

**Build**
- `src/ui/calendar.ts` (297 lines; split the day panel into `calendarDay.ts`): the month and a 280px day panel side
  by side. Title row: the month, previous and next (icons), Today.
- Days: the date at the top, today's in a white circle, the day picked outlined in white. At the bottom, the minutes in
  a small blue pill, then the plan's blocks. Busier days fill stronger brass, with dark text once bright. Keep the plan
  blocks' rules: full when done, half partway, all blue once the plan is done.
- The day panel: its date and "1 of 3 planned done", the plan (name, "4 of 10 min" and a bar, blue once done), + to add a
  piece, Copy plan, Paste, Clear plan (bin, asking first), then "Practised for 9 min" and each piece with its minutes,
  runs and recordings.
- `src/ui/calendarPlan.ts`: restyle the plan list. Keep picking days to paste into.
- Strings: Today, "Done, 5 min", and `practisedFor` reworded to "Practised for 9 min".

**Check**: moving months and back with Today. Picking days. Planning a future day. Copying a past plan and pasting it
into several days. Clearing a plan (asked first). Playing and deleting a recording. A phone, where the blocks shrink
and the minutes hide.

**Tests**
- `calendar.mjs`: `.calendar-minutes` and the day-cell classes if renamed, `.plan-item`, `.plan-add .piece-select`,
  `.day-clear`, and the storage row (now on Settings).
- `flows.mjs`.

## Phase 7: Progress

**Build**
- `src/ui/progress.ts`: one card a piece: its name, when it was last practised and its out-of-tune notes on the left,
  Score and Tempo on the right. Not practised yet becomes a row of chips. Back is an icon button named "Back to Scales".
  Library's groups stay in the sidebar, the group marked.
- `src/ui/progressChart.ts`: brass line, the new greys. Keep `.chart-value`.

**Check**: a group with several practised pieces, one with none, and Listen's progress.

**Tests**: `progress.mjs` (the back button's `‹ Listen` text becomes its label; keep `header strong` and
`header .info-chip` inside each card, or update them).

## Phase 8: clean-up and the phone pass

- Delete what the phases left unused: settings (`listenView`, `staffBig`, `staffOnly`, `todayPlanOpen`), icons,
  strings, CSS, and any test checking a removed thing.
- Every new string in Portuguese. `const pt: Strings` makes TypeScript list any that are missing (`npm run build`).
- CLAUDE.md, UI section: replace "Prefer small icon toggles and single buttons that step through choices over large
  panels" with the rules above: words on controls except the universal icons, joined segments, the settings panel docked
  at the bottom, panels that step big/small/off.
- A pass at every size in `e2e/screens.mjs`'s list, in English and Portuguese.

## Tests at a glance

| File | Phases | What changes |
| --- | --- | --- |
| `e2e/lib.mjs` | 1, 2, 4, 5 | New `setLanguage`, `openSettings`; `section > p` helpers, `setCountIn`, `openDrawers`, `saveStaff` |
| `e2e/screens.mjs` | 1, 2, 3, 5 | 960px width check, Settings audit, Listen audits |
| `e2e/language.mjs` | 2 | Language from the sidebar |
| `e2e/listen.mjs` | 2, 3 | Close enough On/Off, panels instead of the view stepper, fingerboard, dial |
| `e2e/modes.mjs` | 3 | Modes in the sidebar |
| `e2e/practice.mjs` | 4 | Tuner off by default, panels, tile colours |
| `e2e/follow.mjs` | 2, 4 | Keep moving has words, panels, colours |
| `e2e/pitchline.mjs` | 4 | Panels instead of the view button |
| `e2e/tempo.mjs` | 4 | Glide and Count-in move to the settings panel |
| `e2e/section.mjs`, `e2e/sections.mjs` | 2, 4 | No run summary line, switches off the lanes' bar |
| `e2e/fullscreen.mjs` | 2, 4 | Fewer controls in full screen |
| `e2e/track.mjs` | 4, 5 | Track buttons and speed control |
| `e2e/calendar.mjs` | 2, 4, 6 | Today's plan in the sidebar, day cells, storage moved |
| `e2e/flows.mjs` | 2, 6 | Settings screen, storage moved |
| `e2e/played.mjs` | 2 | Hold time on the Settings screen |
| `e2e/library.mjs` | 2, 5 | Groups in the sidebar, no drawers, Close enough on Settings |
| `e2e/pieces.mjs` | 2, 4, 5 | Editor's docked bar, colours, language |
| `e2e/progress.mjs` | 5, 7 | Progress button and back button |
| `e2e/qa.mjs` | 4, 5 | Colours, Library, the whole trip |
| `test/storage.test.ts` | 1, 3, 4 | Sidebar default, `listenView` and `staffBig`/`staffOnly` migrations |
| `test/fingerboard.test.ts` | 3 | Only if the geometry it checks changes |

Unaffected unless their code is touched: the other unit tests (music, judging, log, calendar maths, metronome) and
`e2e/timeline.mjs`, `long.mjs`, `race.mjs`, `wav.mjs`.

## Not in this plan

The parked ideas stay parked: Align as its own screen, listen-to-draft in Add piece, and the tablet options A, B and C.
