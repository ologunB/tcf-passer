// Word-level comparison for dictation: marks each word of the correct sentence as ok / accent slip / wrong / missing.

const norm = (w: string) => w.toLowerCase().replace(/[’`]/g, "'").replace(/[.,!?;:«»"()…]/g, "");
const bare = (w: string) => norm(w).normalize("NFD").replace(/\p{Diacritic}/gu, "");
const words = (s: string) => s.replace(/([’'])/g, "$1 ").split(/\s+/).map((w) => w.trim()).filter((w) => norm(w));

export type Mark = "ok" | "accent" | "wrong" | "missing";

/** Longest-common-subsequence alignment on normalised words. */
export function compareDictation(expected: string, typed: string): { word: string; mark: Mark; typed?: string }[] {
  const e = words(expected);
  const t = words(typed);
  const n = e.length;
  const m = t.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i][j] = bare(e[i]) === bare(t[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { word: string; mark: Mark; typed?: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n) {
    if (j < m && bare(e[i]) === bare(t[j])) {
      out.push({ word: e[i], mark: norm(e[i]) === norm(t[j]) ? "ok" : "accent", typed: t[j] });
      i++;
      j++;
    } else if (j < m && L[i + 1][j + 1] === L[i][j]) {
      // A different word typed in this slot (a misspelling or wrong word) costs nothing in alignment: substitute.
      out.push({ word: e[i], mark: "wrong", typed: t[j] });
      i++;
      j++;
    } else if (j < m && L[i][j + 1] >= L[i + 1][j]) j++; // extra typed word
    else {
      out.push({ word: e[i], mark: "missing" });
      i++;
    }
  }
  return out;
}

export const dictationScore = (marks: { mark: Mark }[]) =>
  marks.length ? marks.reduce((a, m) => a + (m.mark === "ok" ? 1 : m.mark === "accent" ? 0.5 : 0), 0) / marks.length : 0;
