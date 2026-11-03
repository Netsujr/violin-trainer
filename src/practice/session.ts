import { midiOf, type Piece, type PieceNote } from "../music/notes";

export type NoteHit = { pitch: string; ms: number; cents: number; at: number };

export class Session {
  readonly piece: Piece;
  readonly startedAt: number;
  readonly startedAtIso = new Date().toISOString();
  index = 0;
  hits: NoteHit[] = [];
  skipped = 0;
  passSeconds: number[] = [];
  lastRunSeconds = 0;
  private noteStart: number;
  private passStart: number;
  private wholePass = true;

  constructor(piece: Piece, now: number) {
    this.piece = piece;
    this.startedAt = this.noteStart = this.passStart = now;
  }

  get finished() {
    return this.index >= this.piece.notes.length;
  }

  get current(): PieceNote {
    return this.piece.notes[this.index];
  }

  get currentMidi() {
    return midiOf(this.current.pitch);
  }

  // With tempo on, the next note only starts on the beat, some time after the hit itself.
  hit(cents: number, now: number, nextStartsAt = now) {
    this.hits.push({ pitch: this.current.pitch, ms: now - this.noteStart, cents, at: now });
    this.advance(nextStartsAt);
  }

  skip(now: number) {
    this.skipped++;
    this.advance(now);
  }

  // A jump is neither a hit nor a skip. Only a run from note 1 with no rhythm pattern counts as a timed pass, so pass times stay comparable.
  jumpTo(index: number, now: number) {
    this.index = index;
    this.noteStart = this.passStart = now;
    this.wholePass = index === 0 && !this.piece.pattern;
  }

  private advance(now: number) {
    this.index++;
    this.noteStart = now;
    if (!this.finished) return;

    this.lastRunSeconds = (now - this.passStart) / 1000;
    if (this.wholePass) this.passSeconds.push(this.lastRunSeconds);
  }
}
