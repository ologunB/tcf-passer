import { describe, expect, it } from "vitest";
import { allCards, grammarItems, pickItems, tcfItems } from "./content";
import { checkTyped, conjItem, conjItemsFor } from "./conjugation";
import { levelScore, nclcFor, rubricTo20, shuffled } from "./scoring";
import { nextNewCards, newState, previews, Rating, review } from "./srs";

describe("scoring", () => {
  const set = (lv: string, right: number, total: number) =>
    Array.from({ length: total }, (_, i) => ({ level: lv, correct: i < right }));
  it("all wrong/guessing ≈ 100, all right = 699", () => {
    expect(levelScore(["A1", "A2", "B1", "B2", "C1", "C2"].flatMap((l) => set(l, 0, 4)))).toBe(100);
    expect(levelScore(["A1", "A2", "B1", "B2", "C1", "C2"].flatMap((l) => set(l, 4, 4)))).toBe(699);
  });
  it("hard questions count more: perfect A1–B2 then chance at C1/C2 lands around B2 end", () => {
    const s = levelScore([...set("A1", 4, 4), ...set("A2", 6, 6), ...set("B1", 9, 9), ...set("B2", 10, 10), ...set("C1", 2, 7), ...set("C2", 0, 3)]);
    expect(s).toBeGreaterThanOrEqual(500);
    expect(s).toBeLessThan(560);
  });
  it("uses IRCC NCLC bands", () => {
    expect(nclcFor("listening", 458)).toBe(7);
    expect(nclcFor("listening", 457)).toBe(6);
    expect(nclcFor("reading", 453)).toBe(7);
    expect(nclcFor("writing", 10)).toBe(7);
    expect(nclcFor("speaking", 12)).toBe(8);
    expect(nclcFor("listening", 150)).toBeLessThan(4);
  });
  it("rubric levels → /20", () => {
    expect(rubricTo20(["B2", "B2", "B2", "B2"])).toBe(11.5);
    expect(rubricTo20(["A1", "A1"])).toBe(2);
  });
  it("shuffle is deterministic and keeps every option", () => {
    const a = shuffled(["a", "b", "c", "d"], "L-A1-01");
    expect(shuffled(["a", "b", "c", "d"], "L-A1-01").order).toEqual(a.order);
    expect([...a.items].sort()).toEqual(["a", "b", "c", "d"]);
  });
  it("shuffling spreads the correct answer across positions", () => {
    const pos = new Set(tcfItems.map((it) => shuffled(it.options, it.id).order.indexOf(it.answer)));
    expect(pos.size).toBe(4);
  });
});

describe("content", () => {
  it("loads decks, grammar and both TCF banks", () => {
    expect(allCards.length).toBeGreaterThan(500);
    expect(grammarItems.length).toBeGreaterThan(90);
    expect(tcfItems.filter((i) => i.skill === "listening").length).toBeGreaterThan(40);
    expect(tcfItems.filter((i) => i.skill === "reading").length).toBeGreaterThan(40);
  });
  it("every TCF item is well-formed", () => {
    for (const it of tcfItems) {
      expect(it.options).toHaveLength(4);
      expect(it.answer).toBeGreaterThanOrEqual(0);
      expect(it.answer).toBeLessThan(4);
      expect(it.skill === "listening" ? it.audio || it.audioUrl : it.text).toBeTruthy();
    }
    expect(new Set(tcfItems.map((i) => i.id)).size).toBe(tcfItems.length);
  });
  it("picks items per level in difficulty order, unseen first", () => {
    const first = pickItems("reading", { A1: 2, B2: 2 }, new Set(), 1);
    expect(first.map((i) => i.level)).toEqual(["A1", "A1", "B2", "B2"]);
    const seen = new Set(first.map((i) => i.id));
    const second = pickItems("reading", { A1: 2, B2: 2 }, seen, 1);
    expect(second.some((i) => seen.has(i.id))).toBe(false);
  });
});

describe("conjugation", () => {
  it("builds drills from ids", () => {
    expect(conjItem("conj:être:3:pres")?.answer).toBe("sommes");
    expect(conjItem("conj:avoir:0:pres")?.q).toContain("j'");
    expect(conjItem("conj:aller:3:pc")?.answer).toBe("sommes allés");
    expect(conjItem("conj:faire:1:pc")?.answer).toBe("as fait");
  });
  it("unlocks by week", () => {
    expect(conjItemsFor(1).every((i) => i.id.includes("être"))).toBe(true);
    expect(conjItemsFor(6).some((i) => i.id.includes(":pc"))).toBe(false);
    expect(conjItemsFor(8).some((i) => i.id.includes(":pc"))).toBe(true);
  });
  it("checks typed answers, flagging accent-only slips", () => {
    expect(checkTyped(" Sommes ", ["sommes"])).toBe("right");
    expect(checkTyped("etes", ["êtes"])).toBe("accents");
    expect(checkTyped("sont", ["êtes"])).toBe("wrong");
  });
});

describe("srs", () => {
  it("new cards come from unlocked weeks, in order", () => {
    const n = nextNewCards(new Set(), 1, 5);
    expect(n).toHaveLength(5);
    expect(n.every((c) => c.week === 1)).toBe(true);
  });
  it("Good pushes a card later than Again", () => {
    const now = new Date("2026-10-01T09:00:00");
    const s = newState(allCards[0], "2026-10-01", now);
    const again = review(s, Rating.Again, now);
    const good = review(s, Rating.Good, now);
    expect(good.due).toBeGreaterThan(again.due);
    expect(previews(s, now)[Rating.Easy]).toMatch(/d$/);
  });
});
