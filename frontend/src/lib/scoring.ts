// Turning answers into TCF-style scores and NCLC levels.
// TCF bands: A1 100–199, A2 200–299, B1 300–399, B2 400–499, C1 500–599, C2 600–699 (listening/reading),
// and 0–20 for writing/speaking. NCLC mapping is IRCC's table (see labels.ts NCLC_TABLE).

import { NCLC_TABLE } from "./labels";

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Level = (typeof LEVELS)[number];

/**
 * Level-weighted score. Each CEFR level contributes up to 100 points in proportion to accuracy at that level
 * (above the 25% you'd get by guessing), so hard questions are worth more than easy ones: one of two C1 items
 * is worth 50 points, one of ten A1 items 10. A level with no items contributes nothing: a test only proves
 * what it asks. Result is 100–699.
 */
export function levelScore(results: { level: string; correct: boolean }[]): number {
  let total = 100;
  for (const lv of LEVELS) {
    const at = results.filter((r) => r.level === lv);
    if (!at.length) continue;
    const acc = at.filter((r) => r.correct).length / at.length;
    total += 100 * Math.max(0, (acc - 0.25) / 0.75);
  }
  return Math.min(699, Math.round(total));
}

export const cefrFromScore = (score: number): string => (score < 100 ? "A0" : score >= 600 ? "C2" : LEVELS[Math.floor((score - 100) / 100)]);

export function cefrFrom20(s: number): string {
  if (s < 1) return "A0";
  if (s <= 3) return "A1";
  if (s <= 5) return "A2";
  if (s <= 9) return "B1";
  if (s <= 13) return "B2";
  if (s <= 15) return "C1";
  return "C2";
}

/** IRCC table. Below NCLC 4 returns 3 or lower (0 for nothing measurable). */
export function nclcFor(skill: keyof typeof NCLC_TABLE, score: number): number {
  for (const [min, level] of NCLC_TABLE[skill]) if (score >= min) return level;
  if (skill === "listening" || skill === "reading") return score >= 250 ? 3 : score >= 175 ? 2 : score >= 100 ? 1 : 0;
  return score >= 2 ? 3 : score >= 1 ? 2 : 0;
}

export const fmtNclc = (n: number) => (n >= 4 ? String(n) : "<4");

/** Writing/speaking self-rubric: each criterion rated as a CEFR level → /20. */
export const RUBRIC_POINTS: Record<string, number> = { A0: 0, A1: 2, A2: 5, B1: 8, B2: 11.5, C1: 14.5, C2: 18 };
export function rubricTo20(levels: string[]): number {
  if (!levels.length) return 0;
  const avg = levels.reduce((a, l) => a + (RUBRIC_POINTS[l] ?? 0), 0) / levels.length;
  return Math.round(avg * 2) / 2;
}

/** Deterministic shuffle of an item's options so the right answer isn't always in the same place. */
export function shuffled<T>(arr: T[], seed: string): { items: T[]; order: number[] } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const order = arr.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { items: order.map((i) => arr[i]), order };
}
