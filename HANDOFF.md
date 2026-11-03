# Violin Note Trainer: what we're checking

**Issue.** A beginner violinist needs to know which note they're playing and whether it's in tune while working through scales, and the practice sheet can't listen.

**Solution.** A local browser app hears the violin through the laptop microphone, shows the note and tuning, and advances through scales only when the right note is held. It is built and passes every test using synthetic audio. What remains is checking it on a real violin, then the visual pass. Open: the first imported sheet.

## Start here

```bash
cd ~/Documents/GitHub/violin-trainer
npm run dev   # open the printed localhost address in Chrome or Edge
npm test      # 97 unit tests, all passing
```

- **Spec:** the "Violin Note Trainer — Build Handoff" doc. It is not in this repo, so paste it in if a question about intent comes up.
- **Reference for scales, fingers and the look:** `~/Downloads/violin_scales.pdf`. All six scales and their fingers are tested against it.
- **Git:** `main` has two commits and no remote. The UI restyle in section 6 is uncommitted.
- **Built:** milestones 1-4. Tempo mode is not built, because the spec marks it "Later".

## What we're checking

Sections 1-4 passed with synthetic tones fed to real Chrome as its microphone. None of it has heard a real violin, a real room or the laptop mic yet, and that is the point of this round. Place the laptop about 1 m away, facing the violin.

### 1. Listen (real violin)

- [ ] G, D, A and E each show the right note within 0.5 s
- [ ] Each one reads within ±5 cents of a tuner app
- [ ] A silent room stays on "Listening…" with no random notes
- [ ] A 440 Hz tone from a phone reads 440 Hz ±1
- [ ] Scratchy bow attacks and bow changes don't flash wrong notes

### 2. Practice, D major (real violin)

- [ ] Up and down clears all 15 tiles with no false advance
- [ ] A wrong note never advances
- [ ] A repeated note needs a fresh bow stroke (add a piece with `D4 D4 E4` to test it)
- [ ] Play reference through the real speakers doesn't count as a hit
- [ ] Each toggle hides its labels on every tile

### 3. Library and Log (quick click-through, no violin needed)

- [ ] Pasting `D4 E4 F#4 G4 | A4 B4 C#5 D5` gives the same fingers as the built-in D major
- [ ] Settings, pieces and the log survive a reload
- [ ] The Log shows this week's minutes per day

### 4. Recording (real violin)

- [ ] A real session records, survives a reload and plays back
- [ ] Jumping to a marked note starts within 0.5 s of it
- [ ] The recording sounds good enough to learn from

Synthetic result: a 305 s recording, 4.6 MB, 467 markers, with every sampled jump landing on the right pitch.

### 5. First imported piece (not started)

- [ ] Send a sheet in chat, and Claude transcribes it to the quick text format and lists anything uncertain
- [ ] Paste it into Library > Add piece and check the preview
- [ ] The piece clears end to end, with any fixes made to its data

### 6. Visual pass (in progress)

Styling now uses Pico.css, with a warm palette and the layout in `src/style.css`. The canvas can't read CSS, so `src/ui/highway.ts` repeats a few of those colours.

Done:

- The hold ring now traces the tile, so it no longer clips at the top and bottom lanes
- The canvas scales for Retina (checked at an emulated 2x, not yet on a real screen)

Still open:

- The staff marks accidentals on each note, while the PDF uses a key signature
- Listen prints a raw `L2`, tiles show a red `2`, and the PDF adds a small "low" under it
- The spec says lane colours should match the PDF, but the PDF has none. They are now warm browns, so confirm they work

## If a check fails

Starting points, not measured yet:

| Symptom | Try first | Where |
|---|---|---|
| Room noise shows as notes | Raise Mic sensitivity | Settings |
| Quiet playing stays on "Listening…" | Lower Mic sensitivity | Settings |
| Notes drop out while bowing | Lower `MIN_CLARITY` (0.90) | `src/audio/detector.ts` |
| Right note is slow to clear | Widen Tolerance or shorten Hold time | Settings |
| Out-of-tune note clears | Tighten Tolerance or lengthen Hold time | Settings |
| A bow change resets the hold | Raise `GAP_GRACE_MS` (60) | `src/practice/judge.ts` |
| Repeated note clears too easily, or won't clear | Change `RELEASE_MS` (60) | `src/practice/judge.ts` |

## Decisions to confirm

- **Solfège spelling.** The spec lists Do Ré Mi Fa Sol Lá Si, its example says Fá♯, and the PDF has no accents. The app uses the spec's list. It is one constant, `SOLFEGE` in `src/music/notes.ts`.
- **Mic sensitivity direction.** The slider raises the volume gate, following the spec's "raise it in a noisy room". So higher means less sensitive, and the label may read backwards.

## Added beyond the spec

Say if any of these should go:

- A next note an octave from the current one also needs a release. Otherwise the octave rule clears both on one bow.
- The judge ignores the mic during Play reference and for 150 ms after, so the speakers can't score a hit.
- A session runs from Start to Stop, and leaving the screen stops the mic and logs it.
- Listen sessions log as "Free play" and have no note markers.
- Record is locked while a session runs.
- The week starts on Monday.

## Known limits

- Closing or reloading the tab mid-recording loses the audio, though the log entry stays. The same applies in the moment after Stop while it saves (about 150 ms for 5 minutes).
- "Storage used" is the browser's figure for the whole site, not only the recordings.

## Rerunning the browser checks

The scripts are in `e2e/` and run in your installed Chrome. They write generated WAVs, screenshots and Chrome profiles to `e2e/test-results/`, which git ignores. A failed check prints FAIL and makes the script exit with code 1.

```bash
npx vite --port 5199 --strictPort   # leave this running
node e2e/listen.mjs                 # also practice, library, extra and race
node e2e/long.mjs                   # takes 5 minutes
node e2e/inspect.mjs                # lists what long.mjs saved
```

The method: generate a WAV and launch Chrome with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<file.wav>`. The WAV loops and drives the real pipeline end to end.

## Working style

This folder doesn't load the notes from the Reva sessions, so:

- Never commit or push unless told to, and ask each time
- Keep answers short, under 100 words when possible
- Stay inside what was asked, and offer extras in one line instead of building them
- Check before claiming, and say what is still unverified
- Reva's rules and conventions don't apply here
