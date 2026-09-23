import Dexie, { type EntityTable } from "dexie";
import type { Entry } from "./lib/logic";

export interface Setting {
  key: string;
  value: unknown;
}

export type CoreSkillName = "listening" | "reading" | "writing" | "speaking";

/** Per-skill level estimate, written by the placement test, progress checks, mocks and graded tasks. */
export interface Estimate {
  id?: number;
  date: string;
  skill: CoreSkillName;
  nclc: number; // 0–10 (below 4 is shown as "<4")
  score?: number; // 100–699 for listening/reading, 0–20 for writing/speaking
  source: "placement" | "check" | "mock" | "practice" | "graded";
}

/** Spaced-repetition state for one flashcard (ts-fsrs Card, dates stored as ms). */
export interface CardState {
  id: string; // `${deckId}:${fr}`
  deck: string;
  due: number;
  introducedOn: string;
  fsrs: Record<string, unknown>;
}

/** A wrong answer waiting to be got right twice in a row. */
export interface Mistake {
  key: string; // `${source}:${itemId}`
  source: "grammar" | "listening" | "reading" | "vocab" | "conjugation";
  itemId: string;
  prompt: string;
  correct: string;
  given: string;
  streak: number; // correct answers in a row since the mistake
  resolved: 0 | 1;
  createdAt: number;
  lastSeen: number;
}

/** One multiple-choice session (practice set, placement, check or mock section). */
export interface Attempt {
  id?: number;
  date: string;
  kind: "practice" | "placement" | "check" | "mock";
  skill: "listening" | "reading" | "grammar";
  items: { id: string; level: string; correct: boolean }[];
  score?: number; // 100–699 estimate
  nclc?: number;
  durationSec: number;
}

export interface Writing {
  id?: number;
  date: string;
  task: 1 | 2 | 3;
  promptId: string;
  text: string;
  words: number;
  context: "practice" | "check" | "mock";
  selfScore?: number; // /20 from the self-assessment rubric
  aiScore?: number; // /20 from AI grading
  rubric?: Record<string, string>; // criterion -> CEFR level
  ai?: unknown; // full AI feedback JSON
  durationSec?: number;
}

export interface Recording {
  id?: number;
  date: string;
  task: 1 | 2 | 3;
  promptId: string;
  blob: Blob;
  mime: string;
  durationSec: number;
  transcript?: string;
  context: "practice" | "check" | "mock";
  selfScore?: number;
  aiScore?: number;
  rubric?: Record<string, string>;
  ai?: unknown;
}

export const db = new Dexie("tcf-passer") as Dexie & {
  entries: EntityTable<Entry, "id">;
  settings: EntityTable<Setting, "key">;
  estimates: EntityTable<Estimate, "id">;
  cards: EntityTable<CardState, "id">;
  mistakes: EntityTable<Mistake, "key">;
  attempts: EntityTable<Attempt, "id">;
  writings: EntityTable<Writing, "id">;
  recordings: EntityTable<Recording, "id">;
};

db.version(1).stores({
  entries: "++id, date, taskId",
  settings: "key",
  estimates: "++id, date, skill",
});
db.version(2).stores({
  entries: "++id, date, taskId",
  settings: "key",
  estimates: "++id, date, skill",
  cards: "id, deck, due",
  mistakes: "key, source, resolved, lastSeen",
  attempts: "++id, date, kind, skill",
  writings: "++id, date, task, context",
  recordings: "++id, date, task, context",
});

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value });

// ---------- task completion ----------

export async function completeTask(taskId: string, date: string, skill: Entry["skill"], minutes: number, note = "") {
  await db.transaction("rw", db.entries, async () => {
    await db.entries.where("taskId").equals(taskId).delete();
    await db.entries.add({ taskId, date, skill, minutes, note, createdAt: Date.now() });
  });
}

export const uncompleteTask = (taskId: string) => db.entries.where("taskId").equals(taskId).delete();

// ---------- mistake bank ----------

/** Record an answer. Wrong → (re)open the mistake. Right on an open mistake → streak++, resolved at 2. */
export async function recordAnswer(m: Omit<Mistake, "key" | "streak" | "resolved" | "createdAt" | "lastSeen">, correct: boolean) {
  const key = `${m.source}:${m.itemId}`;
  const existing = await db.mistakes.get(key);
  const now = Date.now();
  if (!correct) {
    await db.mistakes.put({ ...m, key, streak: 0, resolved: 0, createdAt: existing?.createdAt ?? now, lastSeen: now });
  } else if (existing && !existing.resolved) {
    const streak = existing.streak + 1;
    await db.mistakes.update(key, { streak, resolved: streak >= 2 ? 1 : 0, lastSeen: now });
  }
}

// ---------- backup ----------

const EXPORT_FORMAT = "tcf-passer-backup";
const SECRET_KEYS = ["anthropicKey", "geminiKey"];

async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}
const dataUrlToBlob = async (u: string) => (await fetch(u)).blob();

export async function exportAll({ includeAudio = false } = {}) {
  const [entries, settings, estimates, cards, mistakes, attempts, writings, recordings] = await Promise.all([
    db.entries.toArray(),
    db.settings.toArray(),
    db.estimates.toArray(),
    db.cards.toArray(),
    db.mistakes.toArray(),
    db.attempts.toArray(),
    db.writings.toArray(),
    db.recordings.toArray(),
  ]);
  const recs = await Promise.all(
    recordings.map(async (r) => ({ ...r, blob: includeAudio ? await blobToDataUrl(r.blob) : null })),
  );
  return {
    format: EXPORT_FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    // API keys stay on this device only.
    settings: settings.filter((s) => !SECRET_KEYS.includes(s.key)),
    entries,
    estimates,
    cards,
    mistakes,
    attempts,
    writings,
    recordings: recs,
  };
}

export async function importAll(data: unknown) {
  const d = data as Awaited<ReturnType<typeof exportAll>>;
  if (!d || d.format !== EXPORT_FORMAT || !Array.isArray(d.entries)) throw new Error("This isn't a TCF Passer backup file.");
  const recordings = await Promise.all(
    (d.recordings ?? []).filter((r) => r.blob).map(async (r) => ({ ...r, blob: await dataUrlToBlob(r.blob as unknown as string) })),
  );
  const tables = [db.entries, db.settings, db.estimates, db.cards, db.mistakes, db.attempts, db.writings, db.recordings];
  await db.transaction("rw", tables, async () => {
    const keys = (await db.settings.bulkGet(SECRET_KEYS)).filter((k) => k !== undefined);
    await Promise.all(tables.map((t) => t.clear()));
    await db.entries.bulkAdd(d.entries);
    await db.settings.bulkPut((d.settings ?? []).filter((x) => !SECRET_KEYS.includes(x.key)));
    await db.settings.bulkPut(keys);
    await db.estimates.bulkAdd(d.estimates ?? []);
    await db.cards.bulkPut(d.cards ?? []);
    await db.mistakes.bulkPut(d.mistakes ?? []);
    await db.attempts.bulkAdd(d.attempts ?? []);
    await db.writings.bulkAdd(d.writings ?? []);
    await db.recordings.bulkAdd(recordings as Recording[]);
  });
  return d.entries.length;
}
