import type { StringName } from "./music/notes";

export type Language = "en" | "pt";

const plural = (count: number, one: string, many: string) => `${count} ${Math.abs(count) === 1 ? one : many}`;

// "Cent" is the same word in both languages.
export const centsText = (cents: number) => plural(cents, "cent", "cents");

const en = {
  locale: "en",
  appName: "Violin Note Trainer",
  language: "Language",
  screens: { Listen: "Listen", Practice: "Practice", Library: "Library", Log: "Log" },
  days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  // Saved logs keep the English title from the data, so only other languages need entries here.
  pieces: {} as Record<string, { title: string; subtitle?: string }>,
  solfege: { C: "Do", D: "Ré", E: "Mi", F: "Fa", G: "Sol", A: "Lá", B: "Si" } as Record<string, string>,
  strings: { E: "E", A: "A", D: "D", G: "G" } as Record<StringName, string>,
  finger: (finger: string) => finger,

  settings: "Settings",
  options: "Options",
  tolerance: "Tolerance",
  holdTime: "Hold time",
  micSensitivity: "Mic sensitivity (volume gate, raise it in a noisy room)",
  toggles: {
    fingers: "Fingers",
    noteNames: "Note names (Do Ré Mi)",
    letterNames: "Letter names (A G D)",
    staff: "Staff",
    grid: "Grid",
    staffNames: "Note names on the staff",
    staffFingers: "Fingers on the staff",
  },

  start: "Start",
  stop: "Stop",
  record: "Record",
  tempo: "Tempo",
  metronome: "Metronome",
  dontWait: "Don't wait",
  dontWaitHint: "The lanes keep moving. Follow along and get a score at the end.",
  startsIn: (count: number) => `Starts in ${count}…`,
  score: (percent: number) => `Score: ${percent}%`,
  hitMissed: (hit: number, missed: number) => `${hit} hit, ${missed} missed`,
  pattern: "Pattern",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  showFullSheet: "Show the full sheet",
  collapseSheet: "Collapse to one moving line",
  patternDone: (pattern: number, seconds: string) => `Pattern ${pattern} done in ${seconds} s.`,
  micUnavailable: (message: string) => `Microphone unavailable: ${message}`,

  listening: "Listening…",
  pressStart: "Press Start and play",
  belowOpenG: "Below the open G string",
  aboveFirstPosition: "Above first position",
  likely: (string: string, finger: string) => `Likely ${string} string, finger ${finger}`,
  recentNotes: "Recent notes",

  noteOf: (note: number, total: number) => `Note ${note} of ${total}`,
  bar: (bar: number) => ` · bar ${bar}`,
  allDone: (total: number) => `All ${total} notes done`,
  passDone: (pass: number, seconds: string) => `Pass ${pass} done in ${seconds} s.`,
  partialDone: (note: number, seconds: string) => `Note ${note} to the end done in ${seconds} s.`,
  hitSkipped: (hit: number, skipped: number) => `${hit} hit, ${skipped} skipped`,
  summary: (hitSkipped: string, cents: number | null) =>
    `This session: ${hitSkipped}${cents === null ? "" : `, ${centsText(cents)} off on average`}.`,
  slowest: (notes: string) => `Slowest: ${notes}`,
  slowestNone: "none",
  playAgain: "Play again",
  playReference: "Play reference",
  skip: "Skip",
  timelineLabel: "Note timeline. Scroll to a note and press Enter to start from it.",

  scales: "Scales",
  songs: "Songs",
  targetDay: "Target day",
  addPiece: "Add piece",
  pieceTitle: "Title",
  savePiece: "Save piece",
  deletePiece: "Delete",
  noTargetDay: "No target day",
  noteCount: (count: number) => plural(count, "note", "notes"),
  stringFinger: (string: string, finger: string) => `${string} string · finger ${finger}`,
  cantRead: (token: string) => `Can't read "${token}"`,
  tokenBelowOpenG: (token: string) => `"${token}" is below the open G string`,
  outsideFirstPosition: (token: string, pitch: string) =>
    `"${token}" is outside first position: add a finger like ${pitch}/4`,

  thisWeek: "This week",
  planned: "Planned",
  trends: "Trends",
  sessions: "Sessions",
  perPass: "per pass",
  storageUsed: (megabytes: string) => `Storage used: ${megabytes} MB`,
  download: "Download",
  deleteRecording: "Delete recording",
  passes: (count: number) => plural(count, "pass", "passes"),
  centsOff: (cents: number) => `${centsText(cents)} off`,
  slowestLower: (notes: string) => `slowest ${notes}`,
};

type Strings = typeof en;

const pt: Strings = {
  locale: "pt-BR",
  appName: "Treinador de Notas para Violino",
  language: "Idioma",
  screens: { Listen: "Ouvir", Practice: "Praticar", Library: "Biblioteca", Log: "Registro" },
  days: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
  pieces: {
    "d-major-1oct": { title: "Ré maior", subtitle: "Uma oitava · cordas Ré e Lá" },
    "a-major-1oct": { title: "Lá maior", subtitle: "Uma oitava · cordas Lá e Mi" },
    "g-major-2oct": { title: "Sol maior", subtitle: "Duas oitavas · as quatro cordas" },
    "c-major-1oct": { title: "Dó maior", subtitle: "Uma oitava · cordas Sol, Ré e Lá" },
    "a-minor-1oct": { title: "Lá menor (natural)", subtitle: "Uma oitava · cordas Lá e Mi" },
    "d-minor-1oct": { title: "Ré menor (natural)", subtitle: "Uma oitava · cordas Ré e Lá" },
    "hot-cross-buns": { title: "Hot Cross Buns", subtitle: "Ré maior · corda Ré" },
    "mary-had-a-little-lamb": { title: "Maria Tinha um Carneirinho", subtitle: "Ré maior · cordas Ré e Lá" },
    "twinkle-twinkle": { title: "Brilha, Brilha, Estrelinha", subtitle: "Lá maior · cordas Lá e Mi" },
    "lightly-row": { title: "Lightly Row", subtitle: "Lá maior · cordas Lá e Mi" },
    "frere-jacques": { title: "Frère Jacques", subtitle: "Ré maior · cordas Sol, Ré e Lá" },
    "ode-to-joy": { title: "Ode à Alegria", subtitle: "Ré maior · cordas Sol, Ré e Lá" },
    "free-play": { title: "Prática livre" },
  },
  solfege: { C: "Dó", D: "Ré", E: "Mi", F: "Fá", G: "Sol", A: "Lá", B: "Si" },
  strings: { E: "Mi", A: "Lá", D: "Ré", G: "Sol" },
  finger: (finger) => finger.replace(/^L(\d)$/, "$1 baixo").replace(/^H(\d)$/, "$1 alto"),

  settings: "Configurações",
  options: "Opções",
  tolerance: "Tolerância",
  holdTime: "Tempo de sustentação",
  micSensitivity: "Sensibilidade do microfone (limite de volume, aumente em um ambiente barulhento)",
  toggles: {
    fingers: "Dedos",
    noteNames: "Nomes das notas (Dó Ré Mi)",
    letterNames: "Cifras (A G D)",
    staff: "Pauta",
    grid: "Grade",
    staffNames: "Nomes das notas na pauta",
    staffFingers: "Dedos na pauta",
  },

  start: "Iniciar",
  stop: "Parar",
  record: "Gravar",
  tempo: "Andamento",
  metronome: "Metrônomo",
  dontWait: "Sem esperar",
  dontWaitHint: "As faixas continuam se movendo. Acompanhe e receba uma pontuação no final.",
  startsIn: (count) => `Começa em ${count}…`,
  score: (percent) => `Pontuação: ${percent}%`,
  hitMissed: (hit, missed) => `${plural(hit, "acerto", "acertos")}, ${plural(missed, "erro", "erros")}`,
  pattern: "Padrão",
  fullscreen: "Tela cheia",
  exitFullscreen: "Sair da tela cheia",
  showFullSheet: "Mostrar a partitura inteira",
  collapseSheet: "Recolher em uma linha contínua",
  patternDone: (pattern, seconds) => `Padrão ${pattern} concluído em ${seconds} s.`,
  micUnavailable: (message) => `Microfone indisponível: ${message}`,

  listening: "Ouvindo…",
  pressStart: "Aperte Iniciar e toque",
  belowOpenG: "Abaixo da corda Sol solta",
  aboveFirstPosition: "Acima da primeira posição",
  likely: (string, finger) => `Provavelmente corda ${string}, dedo ${finger}`,
  recentNotes: "Notas recentes",

  noteOf: (note, total) => `Nota ${note} de ${total}`,
  bar: (bar) => ` · compasso ${bar}`,
  allDone: (total) => `Todas as ${total} notas concluídas`,
  passDone: (pass, seconds) => `Passada ${pass} concluída em ${seconds} s.`,
  partialDone: (note, seconds) => `Da nota ${note} até o fim em ${seconds} s.`,
  hitSkipped: (hit, skipped) => `${plural(hit, "acerto", "acertos")}, ${plural(skipped, "pulada", "puladas")}`,
  summary: (hitSkipped, cents) => `Nesta sessão: ${hitSkipped}${cents === null ? "" : `, ${centsText(cents)} de desvio em média`}.`,
  slowest: (notes) => `Mais lentas: ${notes}`,
  slowestNone: "nenhuma",
  playAgain: "Tocar de novo",
  playReference: "Ouvir referência",
  skip: "Pular",
  timelineLabel: "Linha do tempo das notas. Role até uma nota e aperte Enter para começar por ela.",

  scales: "Escalas",
  songs: "Músicas",
  targetDay: "Dia definido",
  addPiece: "Adicionar peça",
  pieceTitle: "Título",
  savePiece: "Salvar peça",
  deletePiece: "Excluir",
  noTargetDay: "Sem dia definido",
  noteCount: (count) => plural(count, "nota", "notas"),
  stringFinger: (string, finger) => `corda ${string} · dedo ${finger}`,
  cantRead: (token) => `Não foi possível ler "${token}"`,
  tokenBelowOpenG: (token) => `"${token}" está abaixo da corda Sol solta`,
  outsideFirstPosition: (token, pitch) => `"${token}" está fora da primeira posição: adicione um dedo, como ${pitch}/4`,

  thisWeek: "Esta semana",
  planned: "Planejado",
  trends: "Tendências",
  sessions: "Sessões",
  perPass: "por passada",
  storageUsed: (megabytes) => `Armazenamento usado: ${megabytes} MB`,
  download: "Baixar",
  deleteRecording: "Excluir gravação",
  passes: (count) => plural(count, "passada", "passadas"),
  centsOff: (cents) => `${centsText(cents)} de desvio`,
  slowestLower: (notes) => `mais lentas: ${notes}`,
};

const STRINGS: Record<Language, Strings> = { en, pt };

// A live binding: screens read it when they render, and main.ts rebuilds them when the language changes.
export let t: Strings = en;

export function setLanguage(language: Language) {
  t = STRINGS[language];
}

export const localTitle = (id: string, title: string) => t.pieces[id]?.title ?? title;

export const localNumber = (value: number, digits: number) =>
  value.toLocaleString(t.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
