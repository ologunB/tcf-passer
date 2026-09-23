import { describe, expect, it } from "vitest";
import type { Attempt, Estimate } from "../db";
import {
  expectedScore,
  latestBySkill,
  readiness,
  rebalance,
  scoreOf,
  skillLag,
  skillStatus,
  weeklyReview,
  type CoreSkill,
} from "./adapt";
import { addDays } from "./dates";
import type { Entry } from "./logic";
import { dayItems, findDay, plan, type Item } from "./plan";

let nextId = 1;
const est = (skill: CoreSkill, nclc: number, score?: number, date = "2027-01-01", source: Estimate["source"] = "check"): Estimate => ({
  id: nextId++,
  date,
  skill,
  nclc,
  score,
  source,
});
const allAt = (n: number, date = "2027-01-01") => ({
  listening: est("listening", n, undefined, date),
  reading: est("reading", n, undefined, date),
  writing: est("writing", n, undefined, date),
  speaking: est("speaking", n, undefined, date),
});
const task = (id: string, skill: Item["skill"], minutes: number, title = id): Item => ({
  id, title, minutes, skill, resources: [], detail: "", date: "2027-01-10", kind: "task",
});

describe("expectedScore", () => {
  it("hits every waypoint exactly", () => {
    const pts: [number, number, number][] = [[1, 100, 0], [5, 200, 3], [12, 300, 6], [22, 400, 9], [31, 480, 11], [37, 505, 12]];
    for (const [w, mcq, twenty] of pts) {
      expect(expectedScore(w, "listening")).toBe(mcq);
      expect(expectedScore(w, "reading")).toBe(mcq);
      expect(expectedScore(w, "writing")).toBe(twenty);
      expect(expectedScore(w, "speaking")).toBe(twenty);
    }
  });
  it("is linear between waypoints", () => {
    expect(expectedScore(3, "listening")).toBe(150);
    expect(expectedScore(17, "reading")).toBe(350);
    expect(expectedScore(3, "writing")).toBe(1.5);
    expect(expectedScore(26.5, "speaking")).toBe(10);
  });
  it("clamps outside the plan", () => {
    expect(expectedScore(0, "listening")).toBe(100);
    expect(expectedScore(-3, "writing")).toBe(0);
    expect(expectedScore(40, "listening")).toBe(505);
    expect(expectedScore(99, "speaking")).toBe(12);
  });
  it("never decreases", () => {
    for (const s of ["listening", "writing"] as const)
      for (let w = 1; w < 37; w += 0.5) expect(expectedScore(w + 0.5, s)).toBeGreaterThanOrEqual(expectedScore(w, s));
  });
});

describe("latestBySkill", () => {
  it("picks latest by date, then by id", () => {
    const a = { ...est("listening", 4, 340, "2027-01-01"), id: 5 };
    const b = { ...est("listening", 5, 380, "2027-02-01"), id: 1 };
    const c = { ...est("listening", 6, 410, "2027-02-01"), id: 2 };
    const d = est("writing", 5, 6, "2026-12-01");
    const l = latestBySkill([c, a, b, d]);
    expect(l.listening).toBe(c);
    expect(l.writing).toBe(d);
    expect(l.reading).toBeUndefined();
  });
  it("is empty for no estimates", () => {
    expect(latestBySkill([])).toEqual({});
  });
});

describe("scoreOf", () => {
  it("uses the stored score when present", () => expect(scoreOf(est("reading", 5, 390))).toBe(390));
  it("falls back to the NCLC floor", () => {
    expect(scoreOf(est("listening", 7))).toBe(458);
    expect(scoreOf(est("reading", 7))).toBe(453);
    expect(scoreOf(est("writing", 7))).toBe(10);
    expect(scoreOf(est("listening", 2))).toBe(175);
    expect(scoreOf(est("speaking", 0))).toBe(0);
  });
});

describe("skillLag", () => {
  it("is empty when everything is near trajectory", () => {
    // week 12: expected 300 / 6
    const l = { listening: est("listening", 3, 270), reading: est("reading", 3, 300), writing: est("writing", 5, 5), speaking: est("speaking", 6, 7) };
    expect(skillLag(12, l)).toEqual([]);
  });
  it("uses strict thresholds (40 points, 1.5 points)", () => {
    expect(skillLag(12, { listening: est("listening", 3, 260) })).toEqual([]); // exactly 40
    expect(skillLag(12, { listening: est("listening", 3, 259) })).toHaveLength(1);
    expect(skillLag(12, { writing: est("writing", 5, 4.5) })).toEqual([]); // exactly 1.5
    expect(skillLag(12, { writing: est("writing", 4, 4) })).toHaveLength(1);
  });
  it("sorts worst first, comparing points and /20 fairly (in bands)", () => {
    // week 22: expected 400 / 9. listening −60 (1.5 bands), speaking −4 (2.7 bands), reading −50 (1.25 bands)
    const l = {
      listening: est("listening", 6, 340),
      reading: est("reading", 5, 350),
      writing: est("writing", 7, 10),
      speaking: est("speaking", 5, 5),
    };
    const lag = skillLag(22, l);
    expect(lag.map((x) => x.skill)).toEqual(["speaking", "listening", "reading"]);
    expect(lag[0]).toEqual({ skill: "speaking", expected: 9, actual: 5, deficit: 4 });
    expect(lag[1].deficit).toBe(60);
  });
  it("ignores untested skills", () => {
    expect(skillLag(30, {})).toEqual([]);
  });
});

describe("rebalance", () => {
  const items: Item[] = [
    task("a-srs", "vocabulary", 30),
    task("a-listen", "listening", 60, "Relaxed listening"),
    task("a-course", "listening", 35),
    task("a-write", "writing", 35),
    task("a-speak", "speaking", 40),
    task("a-read", "reading", 45),
  ];
  // week 22: expected 400 / 9
  const latest = {
    listening: est("listening", 7, 470), // +70 ahead
    reading: est("reading", 6, 410),
    writing: est("writing", 4, 5), // −4 → worst
    speaking: est("speaking", 6, 8),
  };
  const lag = skillLag(22, latest);

  it("adds a catch-up task for the worst skill and trims the strongest skill's biggest task", () => {
    const before = JSON.stringify(items);
    const r = rebalance("2027-01-10", items, lag, latest);
    expect(JSON.stringify(items)).toBe(before); // inputs untouched
    expect(r.items).toHaveLength(items.length + 1);
    const drill = r.items.find((i) => i.id === "2027-01-10-rebalance")!;
    expect(drill).toMatchObject({ kind: "task", template: "rebalance", title: "Catch-up drill: Writing", skill: "writing", resources: ["app-writing"], minutes: 30, date: "2027-01-10" });
    expect(drill.detail).toMatch(/Writing is 4 points out of 20 below/);
    const trimmed = r.items.find((i) => i.id === "a-listen")!;
    expect(trimmed.minutes).toBe(30);
    expect(trimmed.title).toBe("Relaxed listening (−30 min: you're ahead here)");
    expect(r.items.find((i) => i.id === "a-course")!.minutes).toBe(35);
    expect(r.note).toMatch(/writing catch-up drill.*listening/);
  });

  it("maps listening/reading to an exam task and speaking to speaking", () => {
    const l2 = { listening: est("listening", 4, 330), writing: est("writing", 9, 12) };
    const r = rebalance("2027-01-10", items, skillLag(22, l2), l2);
    expect(r.items.at(-1)).toMatchObject({ skill: "exam", resources: ["app-tcf"], title: "Catch-up drill: Listening" });
    const l3 = { speaking: est("speaking", 3, 2) };
    const r3 = rebalance("2027-01-10", items, skillLag(22, l3), l3);
    expect(r3.items.at(-1)).toMatchObject({ skill: "speaking", resources: ["app-speaking"] });
    // no non-lagging donor → nothing trimmed
    expect(r3.items.slice(0, -1)).toEqual(items);
  });

  it("never trims below 10 minutes", () => {
    const small = [task("s-write", "writing", 25), task("s-listen", "listening", 15)];
    const r = rebalance("2027-01-10", small, lag, latest);
    expect(r.items.find((i) => i.id === "s-listen")!.minutes).toBe(10);
    expect(r.items.find((i) => i.id === "s-listen")!.title).toContain("−5 min");
  });

  it("skips to the next strongest skill when the strongest has no task today", () => {
    const noListen = items.filter((i) => i.skill !== "listening");
    const r = rebalance("2027-01-10", noListen, lag, latest);
    // reading +10 is next strongest
    expect(r.items.find((i) => i.id === "a-read")!.minutes).toBe(15);
  });

  it("returns items unchanged when nothing lags or nothing is tested", () => {
    expect(rebalance("2027-01-10", items, [], latest).items).toBe(items);
    expect(rebalance("2027-01-10", items, lag, {}).items).toBe(items);
    expect(rebalance("2027-01-10", items, [], {}).note).toBeUndefined();
  });

  it("leaves test days and empty days alone, and is idempotent", () => {
    const withMock: Item[] = [{ ...task("m", "exam", 180), kind: "event", eventType: "full-mock" }, ...items];
    expect(rebalance("2027-01-10", withMock, lag, latest).items).toBe(withMock);
    expect(rebalance("2027-01-10", [], lag, latest).items).toEqual([]);
    const once = rebalance("2027-01-10", items, lag, latest).items;
    expect(rebalance("2027-01-10", once, lag, latest).items).toBe(once);
  });

  it("works on a real plan day", () => {
    const date = plan.weeks[20].days[1].date;
    const real = dayItems(plan, date);
    const r = rebalance(date, real, lag, latest);
    const total = (xs: Item[]) => xs.reduce((a, i) => a + i.minutes, 0);
    expect(r.items.length).toBe(real.length + 1);
    // +30 drill, −up to 30 from listening: total rises by at most 30 and at least 0
    expect(total(r.items) - total(real)).toBeGreaterThanOrEqual(0);
    expect(total(r.items) - total(real)).toBeLessThanOrEqual(30);
  });
});

describe("skillStatus", () => {
  it("is null with no estimates", () => expect(skillStatus(10, {})).toBeNull());

  it("on track names the weakest and any untested skill", () => {
    const s = skillStatus(12, { listening: est("listening", 3, 300), writing: est("writing", 5, 6) })!;
    expect(s.state).toBe("on-track");
    expect(s.reason).toMatch(/Weakest right now: listening/);
    expect(s.reason).toMatch(/Not tested yet: reading and speaking/);
    expect(s.action).toMatch(/reading and speaking/);
  });

  it("behind names the skill and the gap", () => {
    const s = skillStatus(22, { listening: est("listening", 5, 380), reading: est("reading", 4, 340) })!;
    expect(s.state).toBe("behind");
    expect(s.headline).toBe("Reading is behind");
    expect(s.reason).toMatch(/340.*400.*60 points/);
    expect(s.action).toMatch(/30-min reading catch-up/);
  });

  it("at risk from week 23 if any skill is under NCLC 6", () => {
    const l = { ...allAt(7), speaking: est("speaking", 5, 6) };
    expect(skillStatus(22, l)!.state).not.toBe("at-risk");
    const s = skillStatus(23, l)!;
    expect(s.state).toBe("at-risk");
    expect(s.reason).toMatch(/Speaking is at NCLC 5/);
    expect(s.action).toMatch(/speaking first/);
  });

  it("at risk from week 31 if any skill is under NCLC 7", () => {
    const l = { ...allAt(8), listening: est("listening", 6, 440) };
    expect(skillStatus(30, l)!.state).not.toBe("at-risk");
    const s = skillStatus(31, l)!;
    expect(s.state).toBe("at-risk");
    expect(s.action).toMatch(/July/);
  });

  it("shows <4 for very low levels", () => {
    const s = skillStatus(25, { writing: est("writing", 2, 1) })!;
    expect(s.reason).toMatch(/NCLC <4/);
  });
});

describe("readiness", () => {
  it("with nothing tested", () => {
    const r = readiness({});
    expect(r).toMatchObject({ score: 0, passToday: false, safe: false, weakest: undefined });
    expect(r.missing).toHaveLength(4);
    expect(r.answer).toMatch(/none of the four/);
  });
  it("fails naming the failing skills", () => {
    const r = readiness({ ...allAt(7), writing: est("writing", 5, 6), speaking: est("speaking", 6, 8) });
    expect(r.passToday).toBe(false);
    expect(r.weakest).toBe("writing");
    expect(r.answer).toMatch(/^No\. Writing \(NCLC 5\) and speaking \(NCLC 6\) are below NCLC 7\.$/);
    expect(r.score).toBe(Math.round(((7 / 8 + 7 / 8 + 5 / 8 + 6 / 8) / 4) * 100));
  });
  it("reports missing tests alongside failures", () => {
    const r = readiness({ listening: est("listening", 5, 380) });
    expect(r.answer).toMatch(/No\. Listening \(NCLC 5\) is below NCLC 7, and reading, writing and speaking haven't been tested/);
  });
  it("can't say when passing skills are incomplete", () => {
    const r = readiness({ listening: est("listening", 8), reading: est("reading", 9) });
    expect(r.passToday).toBe(false);
    expect(r.answer).toMatch(/^Can't say yet\. Writing and speaking haven't been tested/);
    expect(r.score).toBe(50);
  });
  it("passes just, and names the no-margin skills", () => {
    const r = readiness({ ...allAt(8), reading: est("reading", 7) });
    expect(r).toMatchObject({ passToday: true, safe: false });
    expect(r.answer).toMatch(/^Yes, just\..*reading \(NCLC 7\) has no margin/);
  });
  it("is safe at NCLC 8 everywhere and caps score at 100", () => {
    const r = readiness({ ...allAt(8), listening: est("listening", 10) });
    expect(r).toMatchObject({ passToday: true, safe: true, score: 100, missing: [] });
  });
});

describe("weeklyReview", () => {
  const w = plan.weeks[14]; // week 15
  const today = addDays(w.start, 6); // Sunday
  const entriesFor = (from: string, to: string, ratio: number, skill: Entry["skill"] = "listening") => {
    const out: Entry[] = [];
    for (let d = from; d <= to; d = addDays(d, 1))
      out.push({ date: d, taskId: null, skill, minutes: Math.round((findDay(plan, d)?.plannedMinutes ?? 0) * ratio), note: "", createdAt: 0 });
    return out;
  };

  it("splits time by skill, this week vs last", () => {
    const entries = [...entriesFor(w.start, today, 1), ...entriesFor(addDays(w.start, -7), addDays(w.start, -1), 0.5, "reading")];
    const r = weeklyReview(plan, entries, [], [], today);
    expect(r.week).toBe(15);
    expect(r.weekStart).toBe(w.start);
    expect(r.minutesBySkill.listening!.thisWeek).toBeGreaterThan(0);
    expect(r.minutesBySkill.listening!.lastWeek).toBe(0);
    expect(r.minutesBySkill.reading!.lastWeek).toBeGreaterThan(0);
    expect(r.hours.ratio).toBeCloseTo(1, 1);
    expect(r.wins.some((x) => /all the planned time/.test(x))).toBe(true);
  });

  it("flags < 80% of planned hours with a catch-up in next week", () => {
    const r = weeklyReview(plan, entriesFor(w.start, today, 0.5), [], [], today);
    expect(r.concerns.some((x) => /Below 80%/.test(x))).toBe(true);
    expect(r.nextWeek.some((x) => /Add about \d+ min a day/.test(x))).toBe(true);
  });

  it("flags writing/speaking with no time", () => {
    const r = weeklyReview(plan, entriesFor(w.start, today, 1), [], [], today);
    expect(r.concerns.some((x) => /No writing logged/.test(x))).toBe(true);
    expect(r.concerns.some((x) => /No speaking logged/.test(x))).toBe(true);
  });

  it("tracks estimate changes, lag and the resulting plan change", () => {
    const old = addDays(w.start, -10);
    const estimates: Estimate[] = [
      est("listening", 4, 340, old),
      est("listening", 5, 380, addDays(w.start, 2)),
      est("reading", 5, 380, old),
      est("reading", 4, 345, addDays(w.start, 3)),
      est("writing", 3, 2, addDays(w.start, 1)),
      est("speaking", 6, 8, old),
    ];
    const r = weeklyReview(plan, entriesFor(w.start, today, 1), estimates, [], today);
    const ch = Object.fromEntries(r.estimateChanges.map((c) => [c.skill, c]));
    expect(ch.listening.delta).toBe(1);
    expect(ch.reading.delta).toBe(-1);
    expect(ch.writing.from).toBeUndefined();
    expect(ch.writing.to!.nclc).toBe(3);
    expect(ch.speaking.delta).toBe(0);
    expect(r.wins.some((x) => /Listening went up 1 NCLC band/.test(x))).toBe(true);
    expect(r.wins.some((x) => /First score for writing/.test(x))).toBe(true);
    expect(r.concerns.some((x) => /Reading dropped/.test(x))).toBe(true);
    // week 15: expected 330 / 6.9 → writing (2) is worst
    expect(r.lag[0].skill).toBe("writing");
    expect(r.weakest).toBe("writing");
    expect(r.nextWeek[0]).toMatch(/daily 30-min writing catch-up drill/);
    expect(r.readiness.passToday).toBe(false);
  });

  it("ignores estimates after today and reports next week's focus", () => {
    const r = weeklyReview(plan, [], [est("listening", 9, 530, addDays(today, 3))], [], today);
    expect(r.estimateChanges.every((c) => !c.to)).toBe(true);
    expect(r.nextWeek.some((x) => x.startsWith(`Week 16 focus`))).toBe(true);
  });

  it("summarises TCF practice attempts", () => {
    const attempts: Attempt[] = [
      { date: w.start, kind: "practice", skill: "listening", durationSec: 600, items: Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, level: "B1", correct: i < 8 })) },
      { date: addDays(w.start, -3), kind: "practice", skill: "reading", durationSec: 600, items: [{ id: "x", level: "A1", correct: true }] },
    ];
    const r = weeklyReview(plan, [], [], attempts, today);
    expect(r.attempts).toEqual({ count: 1, correct: 8, total: 10 });
    expect(r.wins.some((x) => /8\/10 right/.test(x))).toBe(true);
  });

  it("handles days before the plan starts", () => {
    const r = weeklyReview(plan, [], [], [], addDays(plan.start, -3));
    expect(r.week).toBe(0);
    expect(r.weekStart).toBe(plan.start);
    expect(r.hours.planned).toBe(0);
  });
});
