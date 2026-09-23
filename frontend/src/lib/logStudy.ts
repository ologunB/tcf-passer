import { completeTask, db } from "../db";
import type { Entry } from "./logic";
import { findDay, plan } from "./plan";

/**
 * Log a finished study session. If today's plan has a task from `template` (e.g. "srs", "grammar", "tcf")
 * that isn't ticked yet, tick it with the real minutes; otherwise log it as extra study.
 */
export async function logStudy(date: string, template: string, skill: Entry["skill"], minutes: number, note: string) {
  const m = Math.max(1, Math.round(minutes));
  const task = findDay(plan, date)?.tasks.find((t) => t.template === template);
  if (task && !(await db.entries.where("taskId").equals(task.id).count())) {
    await completeTask(task.id, date, task.skill, m, note);
    return "task" as const;
  }
  await db.entries.add({ date, taskId: null, skill, minutes: m, note, createdAt: Date.now() });
  return "extra" as const;
}
