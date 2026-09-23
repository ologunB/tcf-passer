import { useEffect, useState } from "react";
import { completeTask, setSetting } from "./db";
import { useSetting } from "./hooks";
import type { Item } from "./lib/plan";

/** One running study timer, saved in settings so it survives closing the app. */
export interface TimerState {
  taskId: string;
  title: string;
  skill: Item["skill"];
  startedAt: number | null; // null = paused
  accMs: number;
}

export const elapsedMs = (t: TimerState, now = Date.now()) => t.accMs + (t.startedAt ? now - t.startedAt : 0);

export function useTimer() {
  const timer = useSetting<TimerState | null>("timer", null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!timer?.startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer?.startedAt]);

  return {
    timer,
    elapsed: timer ? elapsedMs(timer, now) : 0,
    start: (item: Item) => {
      const t: TimerState = timer?.taskId === item.id
        ? { ...timer, startedAt: Date.now() }
        : { taskId: item.id, title: item.title, skill: item.skill, startedAt: Date.now(), accMs: 0 };
      setNow(Date.now());
      return setSetting("timer", t);
    },
    pause: () => timer && setSetting("timer", { ...timer, startedAt: null, accMs: elapsedMs(timer) }),
    cancel: () => setSetting("timer", null),
    finish: async (date: string) => {
      if (!timer) return;
      const minutes = Math.max(1, Math.round(elapsedMs(timer) / 60_000));
      await completeTask(timer.taskId, date, timer.skill, minutes);
      await setSetting("timer", null);
      return minutes;
    },
  };
}

export const fmtClock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};
