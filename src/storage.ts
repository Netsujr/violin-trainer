import { del, get, getMany, keys, set } from "idb-keyval";
import scales from "./content/scales.json";
import { fillFingering } from "./music/fingering";
import type { Language } from "./i18n";
import type { Piece, PieceNote } from "./music/notes";
import type { LogEntry } from "./practice/log";
import { isSmallScreen } from "./ui/layout";

export type Settings = {
  language: Language;
  toleranceCents: number;
  holdMs: number;
  minRms: number;
  tempoOn: boolean;
  followOn: boolean;
  loopOn: boolean;
  repeatTopOn: boolean;
  countInOn: boolean;
  countInBeats: number;
  metronomeOn: boolean;
  bpm: number;
  pattern: number;
  staffOpen: boolean;
  staffBig: boolean;
  // The staff on its own, with the lanes hidden. In fullscreen it's the full sheet.
  staffOnly: boolean;
  optionsOpen: boolean;
  toggles: { fingers: boolean; noteNames: boolean; letterNames: boolean; staff: boolean };
  // Pieces marked for practice, in no particular order.
  highlighted: string[];
  // Pieces planned for a day, by its date as "2026-11-10".
  plan: Record<string, string[]>;
  // Whether Practice's "Today's plan" is open. Closed, it shows just the open piece.
  todayPlanOpen: boolean;
  // Minutes to practise planned pieces for, by day and piece, and the last target each piece had.
  planTargets: Record<string, Record<string, number>>;
  lastTargets: Record<string, number>;
  // The piece Practice had open last, to open on again.
  lastPieceId?: string;
};

// view and fullscreen: how the practice screen looked when it was recorded. Older recordings have neither.
export type RecordingView = "lanes" | "bigStaff" | "staffOnly";
export type Recording = { blob: Blob; markers: { pitch: string; seconds: number }[]; view?: RecordingView; fullscreen?: boolean };

export const COUNT_IN_CHOICES = [2, 4, 6, 8, 10];

const DEFAULT_SETTINGS: Omit<Settings, "language" | "optionsOpen"> = {
  toleranceCents: 40,
  holdMs: 200,
  minRms: 0.01,
  tempoOn: false,
  followOn: false,
  loopOn: false,
  repeatTopOn: false,
  countInOn: true,
  countInBeats: 4,
  metronomeOn: false,
  bpm: 60,
  pattern: 0,
  staffOpen: false,
  staffBig: false,
  staffOnly: false,
  toggles: { fingers: true, noteNames: true, letterNames: true, staff: true },
  highlighted: [],
  plan: {},
  todayPlanOpen: true,
  planTargets: {},
  lastTargets: {},
};

const read = <T>(key: string, fallback: T): T => {
  const stored = localStorage.getItem(key);
  return stored === null ? fallback : JSON.parse(stored);
};
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

let settings: Settings | undefined;

export function getSettings() {
  if (!settings) {
    const stored = read<Partial<Settings>>("settings", {});
    settings = {
      language: navigator.language.startsWith("pt") ? "pt" : "en",
      // Open, the options would push the timeline off a phone screen.
      optionsOpen: !isSmallScreen(),
      ...DEFAULT_SETTINGS,
      ...stored,
      // Merged separately, so a switch added later still gets its default on settings saved before it existed.
      toggles: { ...DEFAULT_SETTINGS.toggles, ...stored.toggles },
      // A count-in saved before the choices changed moves up to the next one offered.
      countInBeats: COUNT_IN_CHOICES.find((beats) => beats >= (stored.countInBeats ?? DEFAULT_SETTINGS.countInBeats)) ?? COUNT_IN_CHOICES.at(-1)!,
      // Pieces given a target day before highlighting replaced it stay marked.
      highlighted: stored.highlighted ?? Object.keys((stored as { targetDays?: object }).targetDays ?? {}),
    };
  }
  return settings;
}

export const saveSettings = () => write("settings", getSettings());

// Practice opens on the piece it had open last.
export function rememberPiece(pieceId: string) {
  getSettings().lastPieceId = pieceId;
  saveSettings();
}

const withWayDown = (notes: PieceNote[]) => [...notes, ...notes.slice(0, -1).reverse()];

const fingered = (piece: Piece): Piece => ({ ...piece, notes: piece.notes.map(fillFingering) });

export const isScale = (piece: Piece) => piece.source === "built-in";

export const isHighlighted = (piece: Piece) => getSettings().highlighted.includes(piece.id);

export function toggleHighlighted(piece: Piece) {
  const settings = getSettings();
  settings.highlighted = isHighlighted(piece) ? settings.highlighted.filter((id) => id !== piece.id) : [...settings.highlighted, piece.id];
  saveSettings();
}

// Scales, the songs that come with the app, and songs added later or imported.
export const pieceGroups = (pieces: Piece[]) =>
  [
    ["scales", pieces.filter(isScale)],
    ["songs", pieces.filter((piece) => piece.source === "song")],
    ["customSongs", pieces.filter((piece) => !isScale(piece) && piece.source !== "song")],
  ] as const;

export const builtInPieces = () =>
  (scales as Piece[]).map((scale) => fingered({ ...scale, notes: withWayDown(scale.notes) }));

export const committedPieces = () =>
  Object.values(import.meta.glob<Piece>("./content/pieces/*.json", { eager: true, import: "default" })).map(fingered);

const savedPieces = () => read<Piece[]>("pieces", []);

export const allPieces = () => [...builtInPieces(), ...committedPieces(), ...savedPieces()];

export const savePiece = (piece: Piece) => write("pieces", [...savedPieces(), piece]);

export const updatePiece = (updated: Piece) =>
  write("pieces", savedPieces().map((piece) => (piece.id === updated.id ? updated : piece)));

export const deletePiece = (id: string) =>
  write("pieces", savedPieces().filter((piece) => piece.id !== id));

// The piece being written on the staff, so a tab switch or reload doesn't lose it.
export type PieceDraft = { title: string; notes: PieceNote[]; editingId?: string };
export const loadDraft = () => read<PieceDraft>("pieceDraft", { title: "", notes: [] });
export const saveDraft = (draft: PieceDraft) => write("pieceDraft", draft);

// A backup: settings (with the plans), your own pieces, and the log, as JSON. Not recordings or backing tracks.
const BACKUP_APP = "violin-trainer";
const BACKUP_KEYS = ["settings", "pieces", "log"] as const;
export const backupJson = () =>
  JSON.stringify({ app: BACKUP_APP, savedAt: new Date().toISOString(), ...Object.fromEntries(BACKUP_KEYS.map((key) => [key, read(key, null)])) });

// Puts a backup back, in place of what's here, and says whether the file was one. The page reloads after, to read it.
export function restoreBackup(text: string) {
  let backup: Record<string, unknown>;
  try {
    backup = JSON.parse(text);
  } catch {
    return false;
  }
  const valid = backup?.app === BACKUP_APP && Array.isArray(backup.log) && (backup.pieces === null || Array.isArray(backup.pieces)) && typeof backup.settings === "object";
  if (!valid) return false;
  for (const key of BACKUP_KEYS) {
    if (backup[key] === null) localStorage.removeItem(key);
    else write(key, backup[key]);
  }
  return true;
}

export const loadLog = () => read<LogEntry[]>("log", []);

export const appendLog = (entry: LogEntry) => write("log", [...loadLog(), entry]);

export const saveRecording = (id: string, recording: Recording) => set(id, recording);

export const getRecording = (id: string) => get<Recording>(id);

export const deleteRecording = (id: string) => del(id);

// A recording to play along with, linked to a piece: its tempo, where the piece's first note falls in it (in seconds),
// whether a run uses it, how fast it plays, and whether the mic listens and scores meanwhile.
export type Track = { name: string; blob: Blob; bpm: number; offset: number; on: boolean; speed: number; listen: boolean };
const trackKey = (pieceId: string) => `track:${pieceId}`;
export const getTrack = (pieceId: string) => get<Track>(trackKey(pieceId));
export const saveTrack = (pieceId: string, track: Track) => set(trackKey(pieceId), track);
export const deleteTrack = (pieceId: string) => del(trackKey(pieceId));
export async function listTracks() {
  const ids = (await keys()).map(String).filter((key) => key.startsWith("track:"));
  const tracks = await getMany<Track>(ids);
  return ids.map((key, index) => ({ pieceId: key.slice("track:".length), track: tracks[index]! }));
}
