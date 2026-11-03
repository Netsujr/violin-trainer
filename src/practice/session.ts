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
  private noteStart: number;
  private passStart: number;

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

  hit(cents: number, now: number) {
    this.hits.push({ pitch: this.current.pitch, ms: now - this.noteStart, cents, at: now });
    this.advance(now);
  }

  skip(now: number) {
    this.skipped++;
    this.advance(now);
  }

  restart(now: number) {
    this.index = 0;
    this.noteStart = this.passStart = now;
  }

  private advance(now: number) {
    this.index++;
    this.noteStart = now;
    if (this.finished) this.passSeconds.push((now - this.passStart) / 1000);
  }
}
