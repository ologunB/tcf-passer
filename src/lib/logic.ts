import { addDays, daysBetween, eachDay, fmtHours } from "./dates";
import { dayItems, findDay, type Item, type Plan, type Skill } from "./plan";

/** A logged block of study. `taskId` is set when it came from ticking a plan item. */
export interface Entry {
  id?: number;
  date: string; // day the study happened
  taskId: string | null;
  skill: Skill;
  minutes: number;
  note: string;
  createdAt: number;
}

// Rollover rules (plan.adaptation "rollover"): unfinished items carry over one day only,
// capped at 60 min. Writing/speaking/exam items that miss the cap, or are older, are merged
// into the next day that has a task of the same skill instead of piling up.
export const CARRY_CAP_MINUTES = 60;
const MERGE_SKILLS: Skill[] = ["writing", "speaking", "exam"];
const MERGE_LOOKBACK_DAYS = 7;
// Bookings, admin reminders and the placement test stay on the list until they're done.
const STICKY = (i: Item) =>
  i.kind === "event" && (i.eventType === "booking" || i.eventType === "admin" || i.eventType === "placement" || !!i.critical);

export interface Today {
  items: Item[]; // today's plan
  carried: Item[]; // from yesterday, within the cap
  sticky: Item[]; // overdue bookings/admin, never dropped
  merged: Record<string, number>; // today's item id -> number of missed same-skill items folded into it
  dropped: number; // unfinished items from yesterday that were let go
  deferred: number; // yesterday's W/S/exam misses waiting for a later same-skill day
}

export function buildToday(plan: Plan, today: string, done: Set<string>): Today {
  const items = dayItems(plan, today);
  const yesterday = addDays(today, -1);
  const missedYesterday = dayItems(plan, yesterday).filter((i) => !done.has(i.id));

  const sticky: Item[] = [];
  for (let d = plan.start; d < today; d = addDays(d, 1))
    for (const i of dayItems(plan, d)) if (STICKY(i) && !done.has(i.id)) sticky.push(i);

  // Daily habits (flashcards, the course, shadowing…) come round again today; carrying
  // yesterday's copy would just duplicate them. W/S/exam repeats fold into today's slot instead.
  const todayTemplates = new Set(items.flatMap((i) => (i.template ? [i.template] : [])));
  const repeats = (i: Item) => !!i.template && todayTemplates.has(i.template);
  const carried: Item[] = [];
  let used = 0;
  let dropped = 0;
  const overflow: Item[] = [];
  for (const i of missedYesterday.filter((i) => !STICKY(i) && repeats(i))) {
    if (MERGE_SKILLS.includes(i.skill)) overflow.push(i);
    else dropped++;
  }
  const candidates = missedYesterday
    .filter((i) => !STICKY(i) && !repeats(i))
    .sort((a, b) => rank(a) - rank(b) || a.minutes - b.minutes);
  for (const i of candidates) {
    if (used + i.minutes <= CARRY_CAP_MINUTES) {
      carried.push(i);
      used += i.minutes;
    } else if (MERGE_SKILLS.includes(i.skill)) overflow.push(i);
    else dropped++;
  }

  // Older misses (2..7 days back) plus yesterday's overflow merge into their next same-skill slot.
  const toMerge = [...overflow];
  for (let back = 2; back <= MERGE_LOOKBACK_DAYS; back++) {
    const d = addDays(today, -back);
    if (d < plan.start) break;
    for (const i of dayItems(plan, d)) if (i.kind === "task" && MERGE_SKILLS.includes(i.skill) && !done.has(i.id)) toMerge.push(i);
  }
  const merged: Record<string, number> = {};
  let deferred = 0;
  for (const m of toMerge) {
    if (nextSlotDate(plan, m.date, m.skill, today) !== today) {
      if (m.date === yesterday) deferred++; // merges on the next day with a same-skill task
      continue;
    }
    const target = items.find((i) => i.kind === "task" && i.skill === m.skill);
    if (target) merged[target.id] = (merged[target.id] ?? 0) + 1;
    else dropped++;
  }
  return { items, carried, sticky, merged, dropped, deferred };
}

const rank = (i: Item) => (MERGE_SKILLS.includes(i.skill) ? 0 : 1);

function nextSlotDate(plan: Plan, after: string, skill: Skill, limit: string) {
  for (let d = addDays(after, 1); d <= limit; d = addDays(d, 1))
    if (findDay(plan, d)?.tasks.some((t) => t.skill === skill)) return d;
  return null;
}

// ---------- hours ----------

export const plannedMinutes = (plan: Plan, from: string, to: string) =>
  eachDay(from, to).reduce((a, d) => a + (findDay(plan, d)?.plannedMinutes ?? 0), 0);

export const loggedMinutes = (entries: Entry[], from: string, to: string) =>
  entries.reduce((a, e) => (e.date >= from && e.date <= to ? a + e.minutes : a), 0);

export function minutesByDay(entries: Entry[]) {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.date, (m.get(e.date) ?? 0) + e.minutes);
  return m;
}

// ---------- streak ----------

export const STREAK_MIN_MINUTES = 30;

/** Consecutive days with ≥30 min logged, ending today (or yesterday if today isn't there yet). */
export function streak(entries: Entry[], today: string) {
  const byDay = minutesByDay(entries);
  const ok = (d: string) => (byDay.get(d) ?? 0) >= STREAK_MIN_MINUTES;
  let d = ok(today) ? today : addDays(today, -1);
  let n = 0;
  while (ok(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// ---------- status ----------

export type StatusState = "not-started" | "on-track" | "ahead" | "behind" | "at-risk";

export interface Status {
  state: StatusState;
  headline: string;
  reason: string;
  action?: string;
  ratio?: number;
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

/**
 * Hours-based status using the plan's adaptation rules:
 *  - last 14 days < 80% of planned → Behind (with the catch-up needed)
 *  - last 28 days < 65% of planned → exam date at risk
 *  - ≥ 110% → Ahead on hours
 * Skill levels will join this once tests exist (stage 4).
 */
export function computeStatus(plan: Plan, entries: Entry[], today: string): Status {
  if (today < plan.start) {
    const n = daysBetween(today, plan.start);
    return {
      state: "not-started",
      headline: "Not started yet",
      reason: `Week 1 starts ${n === 1 ? "tomorrow" : `in ${n} days`}. Anything you log before then counts as a head start.`,
      action: "Look through week 1 in the Plan tab, and install the app on your phone's home screen.",
    };
  }
  const yesterday = addDays(today, -1);
  if (yesterday < plan.start)
    return { state: "on-track", headline: "Day 1", reason: "No history yet. Your status appears from tomorrow, based on the hours you log." };

  const w14 = maxDate(plan.start, addDays(today, -14));
  const planned14 = plannedMinutes(plan, w14, yesterday);
  const logged14 = loggedMinutes(entries, w14, yesterday);
  const r14 = planned14 ? logged14 / planned14 : 1;
  const days14 = daysBetween(w14, yesterday) + 1;
  const span = days14 < 14 ? `in the ${days14} day${days14 === 1 ? "" : "s"} so far` : "over the last 14 days";
  const summary = `${fmtHours(logged14)} of ${fmtHours(planned14)} planned ${span} (${pct(r14)}).`;

  const elapsed = daysBetween(plan.start, today);
  if (elapsed >= 28) {
    const w28 = addDays(today, -28);
    const p28 = plannedMinutes(plan, w28, yesterday);
    const r28 = p28 ? loggedMinutes(entries, w28, yesterday) / p28 : 1;
    if (r28 < 0.65)
      return {
        state: "at-risk",
        headline: "Exam date at risk",
        reason: `Only ${pct(r28)} of planned hours over the last 4 weeks. At this pace you won't reach B2 in all four skills by June.`,
        action: "Either get back to about 4 h a day now, or plan to sit in July instead of June and give up the retake buffer.",
        ratio: r28,
      };
  }
  // One or two days is too little data to call "Behind"; show the numbers without the verdict.
  if (days14 < 3)
    return {
      state: "on-track",
      headline: "Early days",
      reason: `${summary} Your status appears once there are 3 days of history.`,
      action: r14 < 0.8 ? "Aim for the full 4 hours today so you start strong." : undefined,
      ratio: r14,
    };
  if (r14 < 0.8) {
    const deficit = planned14 * 0.8 - logged14;
    const perDay = Math.ceil(deficit / 14 / 5) * 5;
    return {
      state: "behind",
      headline: "Behind",
      reason: summary,
      action: `Add about ${perDay} min a day for the next 2 weeks to get back above 80%.`,
      ratio: r14,
    };
  }
  if (r14 >= 1.1) return { state: "ahead", headline: "Ahead on hours", reason: summary, ratio: r14 };
  return { state: "on-track", headline: "On track", reason: summary, ratio: r14 };
}

const maxDate = (a: string, b: string) => (a > b ? a : b);
