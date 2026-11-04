import type { Piece } from "./notes";

// How each note of a piece is played, in beats. Empty means as written, with the usual short hold.
export const PATTERNS: number[][] = [
  [],
  [2],
  [4],
  [0.5, 0.5, 0.5, 0.5, 1, 1],
  [1, 0.5, 0.5, 1, 0.5, 0.5],
];

export function withPattern(piece: Piece, pattern: number): Piece {
  const beats = PATTERNS[pattern];
  if (beats.length === 0) return piece;

  return { ...piece, pattern, notes: piece.notes.flatMap((note) => beats.map((length) => ({ ...note, beats: length }))) };
}

// A scale runs up and back down, so its top note is the middle one.
export function withRepeatedTop(piece: Piece): Piece {
  const top = (piece.notes.length - 1) / 2;
  return { ...piece, notes: [...piece.notes.slice(0, top + 1), ...piece.notes.slice(top)] };
}
