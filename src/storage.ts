import { del, get, set } from "idb-keyval";
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
  metronomeOn: boolean;
  bpm: number;
  pattern: number;
  staffOpen: boolean;
  optionsOpen: boolean;
  toggles: { fingers: boolean; noteNames: boolean; letterNames: boolean; staff: boolean; grid: boolean; staffNames: boolean; staffFingers: boolean };
  targetDays: Record<string, number>;
};

export type Marker = { pitch: string; seconds: number };
export type Recording = { blob: Blob; markers: Marker[] };

const DEFAULT_SETTINGS: Omit<Settings, "language" | "optionsOpen"> = {
  toleranceCents: 40,
  holdMs: 200,
  minRms: 0.01,
  tempoOn: false,
  metronomeOn: false,
  bpm: 60,
  pattern: 0,
  staffOpen: false,
  toggles: { fingers: true, noteNames: true, letterNames: true, staff: true, grid: true, staffNames: true, staffFingers: true },
  targetDays: {},
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
    };
  }
  return settings;
}

export const saveSettings = () => write("settings", getSettings());

const withWayDown = (notes: PieceNote[]) => [...notes, ...notes.slice(0, -1).reverse()];

const fingered = (piece: Piece): Piece => ({ ...piece, notes: piece.notes.map(fillFingering) });

export const builtInPieces = () =>
  (scales as Piece[]).map((scale) => fingered({ ...scale, notes: withWayDown(scale.notes) }));

export const committedPieces = () =>
  Object.values(import.meta.glob<Piece>("./content/pieces/*.json", { eager: true, import: "default" })).map(fingered);

const savedPieces = () => read<Piece[]>("pieces", []);

export const allPieces = () => [...builtInPieces(), ...committedPieces(), ...savedPieces()];

export const savePiece = (piece: Piece) => write("pieces", [...savedPieces(), piece]);

export const deletePiece = (id: string) =>
  write("pieces", savedPieces().filter((piece) => piece.id !== id));

export const loadLog = () => read<LogEntry[]>("log", []);

export const appendLog = (entry: LogEntry) => write("log", [...loadLog(), entry]);

export const saveRecording = (id: string, recording: Recording) => set(id, recording);

export const getRecording = (id: string) => get<Recording>(id);

export const deleteRecording = (id: string) => del(id);
