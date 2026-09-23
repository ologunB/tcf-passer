import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { buildToday, CARRY_CAP_MINUTES, computeStatus, streak, type Entry } from "./logic";
import { dayItems, findDay, plan } from "./plan";

const S = plan.start; // Monday of week 1
const entry = (date: string, minutes: number, taskId: string | null = null): Entry => ({
  date, minutes, taskId, skill: "listening", note: "", createdAt: 0,
});
/** Log exactly `ratio` of each planned day between from..to. */
const logRatio = (from: string, to: string, ratio: number) => {
  const out: Entry[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(entry(d, Math.round((findDay(plan, d)?.plannedMinutes ?? 0) * ratio)));
  return out;
};
const doneAll = (date: string) => dayItems(plan, date).map((i) => i.id);

describe("buildToday", () => {
  it("day 1 has the placement test plus the day's tasks and nothing carried", () => {
    const t = buildToday(plan, S, new Set());
    expect(t.items.some((i) => i.eventType === "placement")).toBe(true);
    expect(t.items.filter((i) => i.kind === "task").length).toBeGreaterThan(5);
    expect(t.carried).toEqual([]);
    expect(t.sticky).toEqual([]);
  });

  it("never duplicates a daily task that comes round again today", () => {
    const day2 = addDays(S, 1); // Tuesday: same templates as Monday
    const done = new Set(doneAll(S).filter((id) => id.includes("-ev-")));
    const t = buildToday(plan, day2, done);
    const todayTemplates = new Set(t.items.map((i) => i.template));
    expect(t.carried.filter((i) => todayTemplates.has(i.template))).toEqual([]);
    // Missed writing/speaking fold into today's same-skill task instead.
    const mergedN = Object.values(t.merged).reduce((a, n) => a + n, 0);
    expect(mergedN).toBeGreaterThan(0);
    const missed = dayItems(plan, S).filter((i) => i.kind === "task").length;
    expect(t.carried.length + mergedN + t.dropped + t.deferred).toBe(missed);
  });

  it("carries yesterday's one-off tasks up to the 60-minute cap, writing/speaking first", () => {
    const sat = addDays(S, 5);
    const sun = addDays(S, 6); // Sunday's templates differ from Saturday's
    const done = new Set(doneAll(sat).filter((id) => id.includes("-ev-")));
    const t = buildToday(plan, sun, done);
    expect(t.carried.reduce((a, i) => a + i.minutes, 0)).toBeLessThanOrEqual(CARRY_CAP_MINUTES);
    expect(t.carried.length).toBeGreaterThan(0);
    expect(["writing", "speaking", "exam"]).toContain(t.carried[0].skill);
    const missed = dayItems(plan, sat).filter((i) => i.kind === "task").length;
    const mergedN = Object.values(t.merged).reduce((a, n) => a + n, 0);
    expect(t.carried.length + mergedN + t.dropped + t.deferred).toBe(missed);
  });

  it("nothing carries when yesterday was fully done", () => {
    const t = buildToday(plan, addDays(S, 1), new Set(doneAll(S)));
    expect(t.carried).toEqual([]);
    expect(t.dropped).toBe(0);
  });

  it("an older miss merges into the next same-skill slot only (no pile-up)", () => {
    const day3 = addDays(S, 2);
    const done = new Set([...doneAll(S).filter((id) => !id.endsWith("-write")), ...doneAll(addDays(S, 1))]);
    const t = buildToday(plan, day3, done);
    // Monday's writing task: its next writing slot was Tuesday, not Wednesday, so nothing merges today.
    expect(Object.keys(t.merged)).toEqual([]);
  });

  it("the placement test stays on the list until it's done", () => {
    const later = addDays(S, 5);
    const t = buildToday(plan, later, new Set());
    expect(t.sticky.map((i) => i.eventType)).toContain("placement");
    const t2 = buildToday(plan, later, new Set([`${S}-ev-placement`]));
    expect(t2.sticky.map((i) => i.eventType)).not.toContain("placement");
  });

  it("an overdue booking reminder is sticky", () => {
    const booking = plan.milestones.find((m) => m.type === "booking")!;
    const t = buildToday(plan, addDays(booking.date, 3), new Set());
    expect(t.sticky.some((i) => i.eventType === "booking" && i.date === booking.date)).toBe(true);
  });
});

describe("computeStatus", () => {
  it("before week 1 → not started", () => {
    expect(computeStatus(plan, [], addDays(S, -5)).state).toBe("not-started");
  });
  it("day 1 → no history yet", () => {
    expect(computeStatus(plan, [], S).headline).toBe("Day 1");
  });
  it("90% of planned hours → on track", () => {
    const today = addDays(S, 20);
    expect(computeStatus(plan, logRatio(S, addDays(today, -1), 0.9), today).state).toBe("on-track");
  });
  it("50% over 2 weeks → behind, with a catch-up amount", () => {
    const today = addDays(S, 20);
    const s = computeStatus(plan, logRatio(S, addDays(today, -1), 0.5), today);
    expect(s.state).toBe("behind");
    expect(s.action).toMatch(/Add about \d+ min a day/);
  });
  it("under 65% for 4 weeks → exam date at risk", () => {
    const today = addDays(S, 35);
    expect(computeStatus(plan, logRatio(S, addDays(today, -1), 0.5), today).state).toBe("at-risk");
  });
  it("120% → ahead", () => {
    const today = addDays(S, 20);
    expect(computeStatus(plan, logRatio(S, addDays(today, -1), 1.2), today).state).toBe("ahead");
  });
  it("doesn't call you Behind after only 1–2 days", () => {
    const today = addDays(S, 2);
    const s = computeStatus(plan, logRatio(S, addDays(today, -1), 0.3), today);
    expect(s.headline).toBe("Early days");
    expect(s.action).toMatch(/full 4 hours/);
  });
  it("counts studying on the day, not only ticked tasks", () => {
    const today = addDays(S, 3);
    const s = computeStatus(plan, logRatio(S, addDays(today, -1), 1), today);
    expect(s.state).toBe("on-track");
    expect(s.reason).toContain("3 days so far");
  });
});

describe("streak", () => {
  const d0 = "2026-10-10";
  it("counts consecutive days with 30+ minutes", () => {
    const e = [entry(d0, 40), entry(addDays(d0, -1), 30), entry(addDays(d0, -2), 20), entry(addDays(d0, -3), 60)];
    expect(streak(e, d0)).toBe(2);
  });
  it("isn't broken just because today hasn't started yet", () => {
    const e = [entry(addDays(d0, -1), 60), entry(addDays(d0, -2), 60)];
    expect(streak(e, d0)).toBe(2);
  });
  it("adds up several short entries on the same day", () => {
    expect(streak([entry(d0, 15), entry(d0, 15)], d0)).toBe(1);
  });
});
