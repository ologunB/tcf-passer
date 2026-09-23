// All study content is plain JSON in /data. Drop a new file in and it's picked up at build time.
import grammarJson from "../../data/grammar.json";
import writingJson from "../../data/prompts/writing.json";
import speakingJson from "../../data/prompts/speaking.json";

// ---------- flashcards ----------

export interface Deck {
  id: string;
  title: string;
  week: number;
  level: string;
  cards: [fr: string, en: string, example?: string][];
}
export interface Flashcard {
  id: string; // `${deck}:${fr}`
  deck: string;
  week: number;
  fr: string;
  en: string;
  ex?: string;
}

const deckModules = import.meta.glob<{ default: Deck }>("../../data/decks/*.json", { eager: true });
export const decks: Deck[] = Object.values(deckModules)
  .map((m) => m.default)
  .sort((a, b) => a.week - b.week);
/** Every card in study order: by deck week, then as written. */
export const allCards: Flashcard[] = decks.flatMap((d) =>
  d.cards.map(([fr, en, ex]) => ({ id: `${d.id}:${fr}`, deck: d.id, week: d.week, fr, en, ex })),
);
export const cardById = new Map(allCards.map((c) => [c.id, c]));

// ---------- grammar ----------

export interface GrammarItem {
  id: string;
  week: number;
  topic: string;
  type: "choice" | "type";
  q: string;
  options?: string[];
  answer: number | string;
  accept?: string[];
  explain: string;
}
export const grammarItems = (grammarJson as unknown as { items: GrammarItem[] }).items;

// ---------- TCF multiple choice ----------

export interface TcfItem {
  id: string;
  skill: "listening" | "reading";
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  audio?: string; // listening script (TTS); lines "A:" / "B:" = two voices
  audioUrl?: string; // optional real recording
  text?: string; // reading passage
  q: string;
  options: string[];
  answer: number;
  explain?: string;
}
const tcfModules = import.meta.glob<{ default: { items: Omit<TcfItem, "skill">[] } }>("../../data/tcf/*.json", { eager: true });
export const tcfItems: TcfItem[] = Object.entries(tcfModules).flatMap(([path, m]) =>
  m.default.items.map((it) => ({ ...it, skill: path.includes("listening") ? "listening" : "reading" }) as TcfItem),
);
const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const byDifficulty = (a: TcfItem, b: TcfItem) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);

/** Real TCF Canada has 39 items per section, rising from A1 to C2. Approximate spread. */
export const MOCK_SPREAD: Record<string, number> = { A1: 4, A2: 6, B1: 9, B2: 10, C1: 7, C2: 3 };

/**
 * Pick `perLevel` items per level for a skill, preferring ones not seen recently (`seen`), in difficulty order.
 * If a level doesn't have enough items, it takes what exists.
 */
export function pickItems(skill: TcfItem["skill"], perLevel: Record<string, number>, seen: Set<string> = new Set(), seed = Date.now()): TcfItem[] {
  let h = seed >>> 0;
  const rnd = () => ((h = (Math.imul(h, 1664525) + 1013904223) >>> 0) / 4294967296);
  const out: TcfItem[] = [];
  for (const lv of LEVEL_ORDER) {
    const n = perLevel[lv] ?? 0;
    if (!n) continue;
    const pool = tcfItems.filter((i) => i.skill === skill && i.level === lv).sort(() => rnd() - 0.5);
    pool.sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)));
    out.push(...pool.slice(0, n));
  }
  return out;
}

// ---------- writing & speaking prompts ----------

export interface WritingPrompt {
  id: string;
  task: 1 | 2 | 3;
  theme: string;
  level: string;
  title: string; // short English label
  instructions: string; // French, as the exam would show it
  docs?: [string, string]; // task 3: the two opposing documents
}
export interface SpeakingPrompt {
  id: string;
  task: 1 | 2 | 3;
  theme: string;
  level: string;
  title: string;
  instructions: string; // French
  questions?: string[]; // task 1: examiner questions; task 2: questions you could ask
}
export const writingPrompts = (writingJson as unknown as { prompts: WritingPrompt[] }).prompts;
export const speakingPrompts = (speakingJson as unknown as { prompts: SpeakingPrompt[] }).prompts;

/** Real exam word limits and timings. */
export const WRITING_TASKS = {
  1: { min: 60, max: 120, label: "Task 1 · Message", suggestMin: 10 },
  2: { min: 120, max: 150, label: "Task 2 · Article / letter", suggestMin: 20 },
  3: { min: 120, max: 180, label: "Task 3 · Compare two views + your opinion", suggestMin: 30 },
} as const;
export const WRITING_TOTAL_MIN = 60;

export const SPEAKING_TASKS = {
  1: { prepSec: 0, speakSec: 120, label: "Task 1 · Guided interview" },
  2: { prepSec: 120, speakSec: 210, label: "Task 2 · Role-play (you ask the questions)" },
  3: { prepSec: 0, speakSec: 270, label: "Task 3 · Give and defend your opinion" },
} as const;

export const countWords = (t: string) => (t.trim().match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? []).length;

// ---------- model answers & phrase bank (optional files) ----------

export interface ModelAnswer {
  text: string;
  notes: string[];
}
export interface PhraseGroup {
  id: string;
  title: string;
  use: string;
  phrases: [fr: string, en: string][];
}
const modelFiles = import.meta.glob<{ default: { models: Record<string, ModelAnswer> } }>("../../data/models.json", { eager: true });
export const modelAnswers: Record<string, ModelAnswer> = Object.values(modelFiles)[0]?.default.models ?? {};
const phraseFiles = import.meta.glob<{ default: { groups: PhraseGroup[] } }>("../../data/phrases.json", { eager: true });
export const phraseGroups: PhraseGroup[] = Object.values(phraseFiles)[0]?.default.groups ?? [];

// ---------- dictation ----------

/** Sentences to dictate: flashcard examples from unlocked weeks, plus short single-voice listening scripts. */
export function dictationPool(week: number): { id: string; fr: string; en?: string; level: string }[] {
  const fromCards = allCards
    .filter((c) => c.ex && c.week <= Math.max(1, week))
    .map((c) => ({ id: `ex:${c.id}`, fr: c.ex!, en: c.en, level: c.week <= 7 ? "A1" : c.week <= 12 ? "A2" : c.week <= 22 ? "B1" : "B2" }));
  const levels = week <= 7 ? ["A1"] : week <= 12 ? ["A1", "A2"] : week <= 22 ? ["A2", "B1"] : ["B1", "B2"];
  const fromTcf = tcfItems
    .filter((i) => i.skill === "listening" && i.audio && !/^[AB]:/m.test(i.audio) && levels.includes(i.level))
    .flatMap((i) => i.audio!.split(/(?<=[.!?])\s+/).filter((s) => s.split(" ").length >= 5 && s.split(" ").length <= 18).map((s, k) => ({ id: `tcf:${i.id}:${k}`, fr: s, level: i.level })));
  return [...fromCards, ...fromTcf];
}
