import { midiOf, type Piece, type PieceNote } from "../music/notes";

type NoteHit = { pitch: string; ms: number; cents: number; at: number };

// Further off than this, it's nearer the next note than the one being played, so it's a wrong note, not an out-of-tune one.
export const NEAR_CENTS = 50;

export class Session {
  readonly piece: Piece;
  readonly startedAt: number;
  readonly startedAtIso = new Date().toISOString();
  index = 0;
  hits: NoteHit[] = [];
  // Notes that passed unplayed while the lanes kept moving.
  missed = 0;
  passSeconds: number[] = [];
  lastRunSeconds = 0;
  // The lanes set the pace, so a run's length says nothing about the playing and it isn't a timed pass.
  following = false;
  // The tempo the lanes moved at, for "Don't wait".
  bpm?: number;
  // How each pitch sounded, from every reading near it, in tune or a near miss: cents added up (sharp above 0), and how many.
  tuning = new Map<string, { cents: number; readings: number }>();
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

  // What the mic heard against the current note, in cents, if anything.
  heard(cents: number | null) {
    if (cents === null || Math.abs(cents) > NEAR_CENTS || this.finished) return;
    const sounded = this.tuning.get(this.current.pitch) ?? { cents: 0, readings: 0 };
    this.tuning.set(this.current.pitch, { cents: sounded.cents + cents, readings: sounded.readings + 1 });
  }

  miss(now: number) {
    this.missed++;
    this.advance(now);
  }

  // A jump is neither a hit nor a miss. Only a whole run with no rhythm pattern counts as a timed pass, so pass times stay comparable.
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
