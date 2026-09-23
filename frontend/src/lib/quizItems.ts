import type { QuizItem } from "../components/Quiz";
import { grammarItems, type GrammarItem } from "./content";
import { conjItem, conjItemsFor, type ConjItem } from "./conjugation";

export const fromGrammar = (g: GrammarItem): QuizItem => ({
  id: g.id, source: "grammar", label: g.topic, q: g.q, options: g.options, answer: g.answer, accept: g.accept, explain: g.explain,
});
export const fromConj = (c: ConjItem): QuizItem => ({ id: c.id, source: "conjugation", label: "conjugation", q: c.q, answer: c.answer, explain: c.explain });

export function quizItemById(source: string, id: string): QuizItem | null {
  if (source === "conjugation") {
    const c = conjItem(id);
    return c ? fromConj(c) : null;
  }
  const g = grammarItems.find((x) => x.id === id);
  return g ? fromGrammar(g) : null;
}

const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

/**
 * A drill session: mostly this week's topic, some review of earlier weeks, some verb drills.
 * mode "week" = this week's grammar; "review" = everything so far; "verbs" = conjugation only.
 */
export function buildSession(week: number, mode: "week" | "review" | "verbs", n = 12): QuizItem[] {
  const w = Math.max(1, week);
  const verbs = shuffle(conjItemsFor(w)).map(fromConj);
  if (mode === "verbs") return verbs.slice(0, n);
  const unlocked = grammarItems.filter((g) => g.week <= w);
  const thisWeek = unlocked.filter((g) => g.week === Math.min(w, Math.max(...grammarItems.map((x) => x.week))));
  if (mode === "week" && thisWeek.length) {
    const core = shuffle(thisWeek).slice(0, Math.min(8, n - 3)).map(fromGrammar);
    const earlier = shuffle(unlocked.filter((g) => !thisWeek.includes(g))).slice(0, 1).map(fromGrammar);
    return shuffle([...core, ...earlier, ...verbs.slice(0, n - core.length - earlier.length)]);
  }
  const g = shuffle(unlocked).slice(0, Math.ceil(n * 0.7)).map(fromGrammar);
  return shuffle([...g, ...verbs.slice(0, n - g.length)]);
}
