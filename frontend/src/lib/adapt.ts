// Skill-level adaptation: where each skill should be by now, which ones lag,
// how the day's plan shifts to catch up, and the honest "would I pass today?" answer.
// Pure functions only (no db, no Date.now) so everything here is unit-tested.

import type { Attempt, Estimate } from "../db";
import { addDays, fmtHours } from "./dates";
import { CORE_SKILLS, NCLC_TABLE, skillLabel, type CoreSkill } from "./labels";
import type { Entry } from "./logic";
import { findDay, findWeek, type Item, type Plan, type Skill } from "./plan";
import { fmtNclc } from "./scoring";

export type { CoreSkill };

const isMcq = (s: CoreSkill) => s === "listening" || s === "reading";

// ---------- expected trajectory ----------

const TRAJECTORY_WEEKS = [1, 5, 12, 22, 31, 37];
const TRAJECTORY_MCQ = [100, 200, 300, 400, 480, 505];
const TRAJECTORY_20 = [0, 3, 6, 9, 11, 12];

/** Where a skill should be by the given plan week (linear between waypoints, clamped at both ends). */
export function expectedScore(week: number, skill: CoreSkill): number {
  const ys = isMcq(skill) ? TRAJECTORY_MCQ : TRAJECTORY_20;
  const xs = TRAJECTORY_WEEKS;
  if (week <= xs[0]) return ys[0];
  if (week >= xs.at(-1)!) return ys.at(-1)!;
  let i = 0;
  while (week > xs[i + 1]) i++;
  const t = (week - xs[i]) / (xs[i + 1] - xs[i]);
  return Math.round((ys[i] + t * (ys[i + 1] - ys[i])) * 10) / 10;
}

// ---------- latest estimate ----------

/** Latest estimate per skill: by date, then by id (later insert wins on the same day). */
export function latestBySkill(estimates: Estimate[]): Partial<Record<CoreSkill, Estimate>> {
  const out: Partial<Record<CoreSkill, Estimate>> = {};
  for (const e of estimates) {
    const cur = out[e.skill];
    if (!cur || e.date > cur.date || (e.date === cur.date && (e.id ?? 0) >= (cur.id ?? 0))) out[e.skill] = e;
  }
  return out;
}

/** The estimate's score, or (if only an NCLC was stored) the lowest score that earns that NCLC. */
export function scoreOf(e: Estimate): number {
  if (typeof e.score === "number") return e.score;
  const row = NCLC_TABLE[e.skill].find(([, lv]) => lv === e.nclc);
  if (row) return row[0];
  if (e.nclc > 10) return NCLC_TABLE[e.skill][0][0];
  // Below NCLC 4: mirror scoring.nclcFor's floors.
  if (isMcq(e.skill)) return e.nclc >= 3 ? 250 : e.nclc === 2 ? 175 : 100;
  return e.nclc >= 3 ? 2 : e.nclc === 2 ? 1 : 0;
}

const fmtGap = (s: CoreSkill, d: number) =>
  isMcq(s) ? `${Math.round(d)} points` : `${Math.round(d * 10) / 10} point${Math.round(d * 10) / 10 === 1 ? "" : "s"} out of 20`;

// ---------- lag ----------

/** Lagging = more than about one NCLC band under the trajectory. */
export const LAG_THRESHOLD: Record<CoreSkill, number> = { listening: 40, reading: 40, writing: 1.5, speaking: 1.5 };

export interface Lag {
  skill: CoreSkill;
  expected: number;
  actual: number;
  deficit: number; // expected − actual, in the skill's own units (points or /20)
}

/** Deficit in "bands" so listening points and writing /20 are comparable. */
const bands = (l: Lag) => l.deficit / LAG_THRESHOLD[l.skill];

function positions(week: number, latest: Partial<Record<CoreSkill, Estimate>>): Lag[] {
  return CORE_SKILLS.flatMap((skill) => {
    const e = latest[skill];
    if (!e) return [];
    const expected = expectedScore(week, skill);
    const actual = scoreOf(e);
    return [{ skill, expected, actual, deficit: Math.round((expected - actual) * 10) / 10 }];
  });
}

/** Skills more than one band under where they should be this week, worst first. Untested skills aren't included. */
export function skillLag(week: number, latest: Partial<Record<CoreSkill, Estimate>>): Lag[] {
  return positions(week, latest)
    .filter((l) => l.deficit > LAG_THRESHOLD[l.skill])
    .sort((a, b) => bands(b) - bands(a));
}

// ---------- rebalance ----------

const REBALANCE_MIN = 30;
const TRIM_FLOOR = 10;
/** Days that are already a test: no catch-up drill on top. */
const TEST_EVENTS = new Set(["placement", "progress-check", "half-mock", "full-mock", "exam"]);

const catchUp: Record<CoreSkill, { skill: Skill; resources: string[]; what: string }> = {
  listening: { skill: "exam", resources: ["app-tcf"], what: "a timed listening set in TCF practice, then replay every question you missed" },
  reading: { skill: "exam", resources: ["app-tcf"], what: "a timed reading set in TCF practice, then reread every passage you got wrong" },
  writing: { skill: "writing", resources: ["app-writing"], what: "one full writing task under the timer, then fix it against the feedback" },
  speaking: { skill: "speaking", resources: ["app-speaking"], what: "one timed speaking task out loud, recorded, then listen back and redo it" },
};

/**
 * Adds a 30-min catch-up drill for the single worst lagging skill and trims 30 min (keeping at least 10)
 * from the biggest task of the strongest skill that isn't lagging. Inputs are never mutated.
 * Returns the items unchanged when nothing lags, nothing is tested, the day has no tasks, or it's a test day.
 */
export function rebalance(
  date: string,
  items: Item[],
  lag: Lag[],
  latest: Partial<Record<CoreSkill, Estimate>>,
): { items: Item[]; note?: string } {
  if (!lag.length || !Object.keys(latest).length) return { items };
  if (!items.some((i) => i.kind === "task")) return { items };
  if (items.some((i) => i.kind === "event" && i.eventType && TEST_EVENTS.has(i.eventType))) return { items };
  const id = `${date}-rebalance`;
  if (items.some((i) => i.id === id)) return { items };

  const worst = lag[0];
  const label = skillLabel[worst.skill];
  const c = catchUp[worst.skill];
  const drill: Item = {
    id,
    kind: "task",
    template: "rebalance",
    title: `Catch-up drill: ${label}`,
    skill: c.skill,
    resources: c.resources,
    minutes: REBALANCE_MIN,
    detail:
      `${label} is ${fmtGap(worst.skill, worst.deficit)} below where the plan expects you this week ` +
      `(${fmtScore(worst.skill, worst.actual)} vs ${fmtScore(worst.skill, worst.expected)}). ` +
      `IRCC uses your weakest skill, so this gets extra time until it catches up: ${c.what}.`,
    date,
  };

  const out = items.map((i) => ({ ...i }));
  // Donor: the strongest skill (most bands above/least below trajectory) that isn't lagging and has a task today.
  const lagging = new Set(lag.map((l) => l.skill));
  const donors = positions(weekFromLag(lag), latest)
    .filter((p) => !lagging.has(p.skill) && p.skill !== worst.skill)
    .sort((a, b) => bands(a) - bands(b));
  let note = `Added a 30-min ${label.toLowerCase()} catch-up drill: it's your furthest skill behind the plan.`;
  for (const d of donors) {
    const target = out
      .filter((i) => i.kind === "task" && i.skill === d.skill && i.minutes > TRIM_FLOOR)
      .sort((a, b) => b.minutes - a.minutes)[0];
    if (!target) continue;
    const cut = Math.min(REBALANCE_MIN, target.minutes - TRIM_FLOOR);
    target.minutes -= cut;
    target.title += d.deficit <= 0 ? ` (−${cut} min: you're ahead here)` : ` (−${cut} min: your strongest skill)`;
    note = `Added a 30-min ${label.toLowerCase()} catch-up drill and took ${cut} min from ${skillLabel[d.skill].toLowerCase()}, which is ${d.deficit <= 0 ? "ahead of the plan" : "further along than the rest"}.`;
    break;
  }
  out.push(drill);
  return { items: out, note };
}

// Lag entries carry `expected`; recover the week they were computed for so donors use the same trajectory point.
function weekFromLag(lag: Lag[]): number {
  const l = lag[0];
  const ys = isMcq(l.skill) ? TRAJECTORY_MCQ : TRAJECTORY_20;
  const xs = TRAJECTORY_WEEKS;
  if (l.expected <= ys[0]) return xs[0];
  if (l.expected >= ys.at(-1)!) return xs.at(-1)!;
  let i = 0;
  while (l.expected > ys[i + 1]) i++;
  return xs[i] + ((l.expected - ys[i]) / (ys[i + 1] - ys[i])) * (xs[i + 1] - xs[i]);
}

const fmtScore = (s: CoreSkill, v: number) => (isMcq(s) ? `${Math.round(v)}` : `${Math.round(v * 10) / 10}/20`);

// ---------- status ----------

export interface SkillStatus {
  state: "on-track" | "behind" | "at-risk";
  headline: string;
  reason: string;
  action: string;
}

/** Level-based status. null until at least one skill has been tested. */
export function skillStatus(week: number, latest: Partial<Record<CoreSkill, Estimate>>): SkillStatus | null {
  const tested = CORE_SKILLS.filter((s) => latest[s]);
  if (!tested.length) return null;
  const untested = CORE_SKILLS.filter((s) => !latest[s]);
  const untestedNote = untested.length ? ` Not tested yet: ${list(untested.map((s) => skillLabel[s].toLowerCase()))}.` : "";

  const need = week >= 31 ? 7 : week >= 23 ? 6 : null;
  if (need !== null) {
    const low = tested.filter((s) => latest[s]!.nclc < need).sort((a, b) => latest[a]!.nclc - latest[b]!.nclc);
    if (low.length) {
      const s = low[0];
      const n = latest[s]!.nclc;
      return {
        state: "at-risk",
        headline: "Exam date at risk",
        reason:
          `${list(low.map((x) => `${skillLabel[x]} is at NCLC ${fmtNclc(latest[x]!.nclc)}`))}. ` +
          `By week ${need === 7 ? 31 : 23} every skill should be at NCLC ${need} or better, and IRCC scores you on your weakest.` +
          untestedNote,
        action:
          `Put ${skillLabel[s].toLowerCase()} first every day (${7 - n > 0 ? `${7 - n} NCLC band${7 - n > 1 ? "s" : ""} to go` : "right at the line"}). ` +
          (week >= 31
            ? "If it isn't at NCLC 7 on the next mock, sit in July rather than June."
            : "Test it again at the next progress check; if it hasn't moved, consider the July sitting."),
      };
    }
  }

  const lag = skillLag(week, latest);
  if (lag.length) {
    const w = lag[0];
    const e = latest[w.skill]!;
    const others = lag.slice(1).map((l) => skillLabel[l.skill].toLowerCase());
    return {
      state: "behind",
      headline: `${skillLabel[w.skill]} is behind`,
      reason:
        `${skillLabel[w.skill]} is at ${fmtScore(w.skill, w.actual)} (NCLC ${fmtNclc(e.nclc)}); the plan expects about ${fmtScore(w.skill, w.expected)} by week ${week}, ` +
        `a gap of ${fmtGap(w.skill, w.deficit)}.` +
        (others.length ? ` Also behind: ${list(others)}.` : "") +
        untestedNote,
      action: `Today's plan includes a 30-min ${skillLabel[w.skill].toLowerCase()} catch-up drill, paid for by your strongest skill. Do it before anything optional.`,
    };
  }

  const weakest = tested.reduce((a, s) => (latest[s]!.nclc < latest[a]!.nclc ? s : a));
  return {
    state: "on-track",
    headline: "Levels on track",
    reason:
      `Every tested skill is within one band of where the plan expects you at week ${week}. ` +
      `Weakest right now: ${skillLabel[weakest].toLowerCase()} at NCLC ${fmtNclc(latest[weakest]!.nclc)}.` +
      untestedNote,
    action: untested.length
      ? `Get a score for ${list(untested.map((s) => skillLabel[s].toLowerCase()))} at the next check so nothing is guesswork.`
      : `Keep the plan as it is; ${skillLabel[weakest].toLowerCase()} is the one to watch.`,
  };
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// ---------- readiness ----------

export interface Readiness {
  score: number; // 0–100
  passToday: boolean; // NCLC 7+ in all four
  safe: boolean; // NCLC 8+ in all four
  weakest?: CoreSkill;
  missing: CoreSkill[];
  answer: string;
}

/** "If I sat the exam today, would I get NCLC 7 in all four?" */
export function readiness(latest: Partial<Record<CoreSkill, Estimate>>): Readiness {
  const missing = CORE_SKILLS.filter((s) => !latest[s]);
  const tested = CORE_SKILLS.filter((s) => latest[s]);
  const n = (s: CoreSkill) => latest[s]?.nclc ?? 0;
  const score = Math.round(CORE_SKILLS.reduce((a, s) => a + Math.min(1, n(s) / 8) * 100, 0) / 4);
  const passToday = missing.length === 0 && tested.every((s) => n(s) >= 7);
  const safe = missing.length === 0 && tested.every((s) => n(s) >= 8);
  const weakest = tested.length ? tested.reduce((a, s) => (n(s) < n(a) ? s : a)) : undefined;
  const failing = tested.filter((s) => n(s) < 7);
  const lbl = (s: CoreSkill) => `${skillLabel[s].toLowerCase()} (NCLC ${fmtNclc(n(s))})`;

  let answer: string;
  if (!tested.length) answer = "No way to tell yet: none of the four skills has been tested. Take the placement test or a progress check.";
  else if (failing.length)
    answer =
      `No. ${cap(list(failing.map(lbl)))} ${failing.length > 1 ? "are" : "is"} below NCLC 7` +
      (missing.length ? `, and ${list(missing.map((s) => skillLabel[s].toLowerCase()))} ${missing.length > 1 ? "haven't" : "hasn't"} been tested.` : ".");
  else if (missing.length)
    answer = `Can't say yet. ${cap(list(missing.map((s) => skillLabel[s].toLowerCase())))} ${missing.length > 1 ? "haven't" : "hasn't"} been tested; the ones that have are at NCLC 7 or better.`;
  else if (!safe)
    answer = `Yes, just. All four are at NCLC 7 or better, but ${list(tested.filter((s) => n(s) < 8).map(lbl))} ${tested.filter((s) => n(s) < 8).length > 1 ? "have" : "has"} no margin: a bad day could drop ${tested.filter((s) => n(s) < 8).length > 1 ? "them" : "it"} below 7.`;
  else answer = "Yes. All four are at NCLC 8 or better, so there's a one-band margin on each.";
  return { score, passToday, safe, weakest, missing, answer };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- weekly review ----------

export interface EstimateChange {
  skill: CoreSkill;
  from?: Estimate; // latest before this week
  to?: Estimate; // latest now
  delta?: number; // NCLC change (only when both exist)
}

export interface WeeklyReview {
  week: number; // plan week (0 before the plan starts)
  weekStart: string;
  weekEnd: string;
  hours: { logged: number; planned: number; ratio: number }; // minutes, this week up to today
  minutesBySkill: Partial<Record<Skill, { thisWeek: number; lastWeek: number }>>;
  estimateChanges: EstimateChange[];
  weakest?: CoreSkill;
  lag: Lag[];
  readiness: Readiness;
  attempts: { count: number; correct: number; total: number };
  wins: string[];
  concerns: string[];
  nextWeek: string[];
}

export function weeklyReview(plan: Plan, entries: Entry[], estimates: Estimate[], attempts: Attempt[], today: string): WeeklyReview {
  const w = findWeek(plan, today);
  const weekStart = w ? w.start : today < plan.start ? plan.start : plan.weeks.at(-1)!.start;
  const weekEnd = addDays(weekStart, 6);
  const upTo = today < weekEnd ? today : weekEnd;
  const lastStart = addDays(weekStart, -7);
  const lastEnd = addDays(weekStart, -1);
  const weekNo = w?.week ?? (today < plan.start ? 0 : plan.weeks.length);

  // Time by skill
  const minutesBySkill: WeeklyReview["minutesBySkill"] = {};
  for (const e of entries) {
    const bucket = e.date >= weekStart && e.date <= upTo ? "thisWeek" : e.date >= lastStart && e.date <= lastEnd ? "lastWeek" : null;
    if (!bucket) continue;
    const m = (minutesBySkill[e.skill] ??= { thisWeek: 0, lastWeek: 0 });
    m[bucket] += e.minutes;
  }
  let planned = 0;
  const plannedBySkill = new Map<Skill, number>();
  for (let d = weekStart; d <= upTo; d = addDays(d, 1)) {
    const day = findDay(plan, d);
    if (!day) continue;
    planned += day.plannedMinutes;
    for (const t of day.tasks) plannedBySkill.set(t.skill, (plannedBySkill.get(t.skill) ?? 0) + t.minutes);
  }
  const logged = Object.values(minutesBySkill).reduce((a, m) => a + m!.thisWeek, 0);
  const ratio = planned ? logged / planned : 1;

  // Estimates
  const now = estimates.filter((e) => e.date <= today);
  const before = now.filter((e) => e.date < weekStart);
  const latestNow = latestBySkill(now);
  const latestBefore = latestBySkill(before);
  const estimateChanges: EstimateChange[] = CORE_SKILLS.map((skill) => {
    const from = latestBefore[skill];
    const to = latestNow[skill];
    return { skill, from, to, delta: from && to ? to.nclc - from.nclc : undefined };
  });
  const ready = readiness(latestNow);
  const lag = skillLag(Math.max(1, weekNo), latestNow);

  // MCQ attempts this week
  const weekAttempts = attempts.filter((a) => a.date >= weekStart && a.date <= upTo);
  const att = {
    count: weekAttempts.length,
    correct: weekAttempts.reduce((a, x) => a + x.items.filter((i) => i.correct).length, 0),
    total: weekAttempts.reduce((a, x) => a + x.items.length, 0),
  };

  const wins: string[] = [];
  const concerns: string[] = [];
  const nextWeek: string[] = [];
  const pct = (r: number) => `${Math.round(r * 100)}%`;

  // Hours
  if (planned > 0) {
    if (ratio >= 1) wins.push(`You did all the planned time: ${fmtHours(logged)} of ${fmtHours(planned)} so far this week.`);
    else if (ratio >= 0.8) wins.push(`${fmtHours(logged)} of ${fmtHours(planned)} planned (${pct(ratio)}). Above the 80% line.`);
    else concerns.push(`Only ${fmtHours(logged)} of ${fmtHours(planned)} planned (${pct(ratio)}). Below 80%, the June date starts to slip.`);
  }
  // Estimates
  for (const c of estimateChanges) {
    if (c.to && c.to.date >= weekStart) {
      if (c.delta !== undefined && c.delta > 0) wins.push(`${skillLabel[c.skill]} went up ${c.delta} NCLC band${c.delta > 1 ? "s" : ""} (${fmtNclc(c.from!.nclc)} → ${fmtNclc(c.to.nclc)}).`);
      else if (c.delta !== undefined && c.delta < 0)
        concerns.push(`${skillLabel[c.skill]} dropped from NCLC ${fmtNclc(c.from!.nclc)} to ${fmtNclc(c.to.nclc)}. One test can be noisy; if the next one agrees, it's real.`);
      else if (c.delta === undefined) wins.push(`First score for ${skillLabel[c.skill].toLowerCase()}: NCLC ${fmtNclc(c.to.nclc)}.`);
    }
  }
  // Practice accuracy
  if (att.total >= 10) {
    const acc = att.correct / att.total;
    const line = `${att.count} TCF-style set${att.count > 1 ? "s" : ""} this week, ${att.correct}/${att.total} right (${pct(acc)}).`;
    if (acc >= 0.7) wins.push(line);
    else if (acc < 0.5) concerns.push(`${line} Under half: slow down and read every explanation.`);
  }
  // Skills that got no time despite being planned
  for (const s of ["writing", "speaking"] as const) {
    const plannedS = plannedBySkill.get(s) ?? 0;
    const did = minutesBySkill[s]?.thisWeek ?? 0;
    if (plannedS >= 30 && did === 0) concerns.push(`No ${s} logged this week (${plannedS} min were planned). It counts as much as any other skill, and it can't be crammed in the last month.`);
  }
  // Lag
  for (const l of lag)
    concerns.push(
      `${skillLabel[l.skill]} is ${fmtGap(l.skill, l.deficit)} behind the week-${Math.max(1, weekNo)} target (${fmtScore(l.skill, l.actual)} vs ${fmtScore(l.skill, l.expected)}).`,
    );
  if (ready.missing.length && ready.missing.length < 4)
    concerns.push(`No score yet for ${list(ready.missing.map((s) => skillLabel[s].toLowerCase()))}, so the readiness answer is incomplete.`);

  // Next week
  if (lag.length) {
    const wl = lag[0];
    const strongest = positions(Math.max(1, weekNo), latestNow)
      .filter((p) => !lag.some((l) => l.skill === p.skill))
      .sort((a, b) => bands(a) - bands(b))[0];
    nextWeek.push(
      `A daily 30-min ${skillLabel[wl.skill].toLowerCase()} catch-up drill` +
        (strongest ? `, with 30 min taken from ${skillLabel[strongest.skill].toLowerCase()} (your strongest).` : ", added on top of the plan (no skill is far enough ahead to pay for it).") +
        " It stays until the next test shows it within one band of the target.",
    );
  } else if (Object.keys(latestNow).length) {
    nextWeek.push("No catch-up drills: every tested skill is within one band of the plan. The plan runs as written.");
  }
  if (planned > 0 && ratio < 0.8) {
    const deficit = planned * 0.8 - logged;
    const perDay = Math.max(5, Math.ceil(deficit / 7 / 5) * 5);
    nextWeek.push(`Add about ${perDay} min a day next week to make up the shortfall (${fmtHours(deficit)} short of 80%).`);
  }
  const next = plan.weeks.find((x) => x.start === addDays(weekStart, 7));
  if (next) {
    nextWeek.push(`Week ${next.week} focus: ${next.focus.grammar}; vocabulary: ${next.focus.vocab}.`);
    const nextEnd = addDays(next.start, 6);
    for (const m of plan.milestones.filter((m) => m.date >= next.start && m.date <= nextEnd)) nextWeek.push(`${m.title} on ${m.date}.`);
  }

  return {
    week: weekNo,
    weekStart,
    weekEnd,
    hours: { logged, planned, ratio },
    minutesBySkill,
    estimateChanges,
    weakest: ready.weakest,
    lag,
    readiness: ready,
    attempts: att,
    wins,
    concerns,
    nextWeek,
  };
}

