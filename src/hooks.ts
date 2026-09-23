import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { todayISO } from "./lib/dates";
import { examEvent, plan } from "./lib/plan";
import type { Entry } from "./lib/logic";

/** Today's date. Refreshes when the app comes back to the foreground (e.g. after midnight).
 *  `?today=YYYY-MM-DD` in the URL overrides it, for trying out future days. */
export function useToday() {
  const override = new URLSearchParams(location.search).get("today");
  const [today, setToday] = useState(override ?? todayISO());
  useEffect(() => {
    if (override) return;
    const tick = () => setToday(todayISO());
    const id = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [override]);
  return today;
}

export function useEntries(): Entry[] | undefined {
  return useLiveQuery(() => db.entries.toArray(), []);
}

/** Ids of plan items that have been ticked off. */
export function useDone(entries: Entry[] | undefined) {
  return useMemo(() => new Set((entries ?? []).flatMap((e) => (e.taskId ? [e.taskId] : []))), [entries]);
}

export function useSetting<T>(key: string, fallback: T): T {
  const row = useLiveQuery(() => db.settings.get(key), [key]);
  return row ? (row.value as T) : fallback;
}

export const useExamDate = () => useSetting<string>("examDate", examEvent(plan)?.date ?? plan.deadline);

export function useEstimates() {
  return useLiveQuery(() => db.estimates.orderBy("date").toArray(), []);
}
