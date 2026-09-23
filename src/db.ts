import Dexie, { type EntityTable } from "dexie";
import type { Entry } from "./lib/logic";

export interface Setting {
  key: string;
  value: unknown;
}

/** Per-skill level estimate. Written by tests from stage 4 onward; the dashboard reads it now. */
export interface Estimate {
  id?: number;
  date: string;
  skill: "listening" | "reading" | "writing" | "speaking";
  nclc: number;
  score?: number;
  source: string;
}

export const db = new Dexie("tcf-passer") as Dexie & {
  entries: EntityTable<Entry, "id">;
  settings: EntityTable<Setting, "key">;
  estimates: EntityTable<Estimate, "id">;
};

db.version(1).stores({
  entries: "++id, date, taskId",
  settings: "key",
  estimates: "++id, date, skill",
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

// ---------- backup ----------

const EXPORT_FORMAT = "tcf-passer-backup";

export async function exportAll() {
  const [entries, settings, estimates] = await Promise.all([db.entries.toArray(), db.settings.toArray(), db.estimates.toArray()]);
  return { format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), entries, settings, estimates };
}

export async function importAll(data: unknown) {
  const d = data as Awaited<ReturnType<typeof exportAll>>;
  if (!d || d.format !== EXPORT_FORMAT || !Array.isArray(d.entries)) throw new Error("This isn't a TCF Passer backup file.");
  await db.transaction("rw", db.entries, db.settings, db.estimates, async () => {
    await Promise.all([db.entries.clear(), db.settings.clear(), db.estimates.clear()]);
    await db.entries.bulkAdd(d.entries);
    await db.settings.bulkPut(d.settings ?? []);
    await db.estimates.bulkAdd(d.estimates ?? []);
  });
  return d.entries.length;
}
