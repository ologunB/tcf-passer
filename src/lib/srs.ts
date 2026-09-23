// Flashcard scheduling with FSRS (ts-fsrs). Card state is stored as plain JSON (dates as ms).
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";
import type { CardState } from "../db";
import { allCards, type Flashcard } from "./content";

export { Rating };
export type { Grade };

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9, maximum_interval: 365 }));

export const toStored = (c: Card): Record<string, unknown> => ({
  ...c,
  due: +c.due,
  last_review: c.last_review ? +c.last_review : undefined,
});
export const fromStored = (s: Record<string, unknown>): Card =>
  ({ ...s, due: new Date(s.due as number), last_review: s.last_review ? new Date(s.last_review as number) : undefined }) as Card;

export function newState(card: Flashcard, today: string, now = new Date()): CardState {
  const c = createEmptyCard(now);
  return { id: card.id, deck: card.deck, due: +c.due, introducedOn: today, fsrs: toStored(c) };
}

export function review(state: CardState, grade: Grade, now = new Date()): CardState {
  const { card } = scheduler.next(fromStored(state.fsrs), now, grade);
  return { ...state, due: +card.due, fsrs: toStored(card) };
}

/** How long until the card comes back for each grade, e.g. "10m", "3d". */
export function previews(state: CardState, now = new Date()): Record<Grade, string> {
  const p = scheduler.repeat(fromStored(state.fsrs), now);
  const fmt = (d: Date) => {
    const m = (+d - +now) / 60_000;
    return m < 60 ? `${Math.max(1, Math.round(m))}m` : m < 1440 ? `${Math.round(m / 60)}h` : m < 43_200 ? `${Math.round(m / 1440)}d` : `${Math.round(m / 43_200)}mo`;
  };
  return {
    [Rating.Again]: fmt(p[Rating.Again].card.due),
    [Rating.Hard]: fmt(p[Rating.Hard].card.due),
    [Rating.Good]: fmt(p[Rating.Good].card.due),
    [Rating.Easy]: fmt(p[Rating.Easy].card.due),
  } as Record<Grade, string>;
}

/** Cards not started yet, in study order, from decks unlocked by the current plan week. */
export function nextNewCards(started: Set<string>, week: number, n: number): Flashcard[] {
  return allCards.filter((c) => c.week <= Math.max(1, week) && !started.has(c.id)).slice(0, n);
}
