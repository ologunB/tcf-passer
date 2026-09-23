import { describe, expect, it } from "vitest";
import { compareDictation, dictationScore } from "./diff";

describe("dictation diff", () => {
  it("perfect answer, ignoring case and punctuation", () => {
    const r = compareDictation("Je m'appelle Awa.", "je m'appelle awa");
    expect(r.every((w) => w.mark === "ok")).toBe(true);
    expect(dictationScore(r)).toBe(1);
  });
  it("flags accent slips, wrong and missing words", () => {
    const r = compareDictation("Nous sommes arrivés à Montréal hier.", "nous sommes arrives a Montreal");
    expect(r.map((w) => w.mark)).toEqual(["ok", "ok", "accent", "accent", "accent", "missing"]);
    const r2 = compareDictation("Il fait froid", "il fais froid");
    expect(r2[1]).toMatchObject({ mark: "wrong", typed: "fais" });
  });
});
