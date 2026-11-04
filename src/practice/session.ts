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
  // The lanes set the pace, so a run's length says nothing about the playing and it isn't a timed pass.
  following = false;
  private noteStart: number;
  private passStart: number;
  private wholePass = true;
  // Where the run stops: the end of the piece, or of a selected section.
  private end: number;

  constructor(piece: Piece, now: number) {
    this.piece = piece;
    this.end = piece.notes.length;
    this.startedAt = this.noteStart = this.passStart = now;
  }

  get finished() {
    return this.index >= this.end;
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
  jumpTo(index: number, now: number, end = this.piece.notes.length) {
    this.index = index;
    this.end = end;
    this.noteStart = this.passStart = now;
    this.wholePass = index === 0 && end === this.piece.notes.length && !this.piece.pattern && !this.following;
  }

  private advance(now: number) {
    this.index++;
    this.noteStart = now;
    if (!this.finished) return;

    this.lastRunSeconds = (now - this.passStart) / 1000;
    if (this.wholePass) this.passSeconds.push(this.lastRunSeconds);
  }
}
