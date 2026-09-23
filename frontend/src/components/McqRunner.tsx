import { useEffect, useMemo, useRef, useState } from "react";
import { recordAnswer } from "../db";
import type { TcfItem } from "../lib/content";
import { shuffled } from "../lib/scoring";
import { rateForLevel, speak, stop, ttsAvailable } from "../lib/tts";
import { fmtClock } from "../timer";
import { Icon } from "./Icon";

export interface McqAnswer {
  id: string;
  level: string;
  correct: boolean;
  chosen: number | null; // index in the item's ORIGINAL options
}

/**
 * Runs a list of TCF-style questions.
 * practice: instant feedback + explanation, replays allowed, wrong answers go to the mistake bank.
 * exam: listening audio plays once automatically, forward-only, no feedback, countdown to `deadline`.
 */
export function McqRunner({ items, mode, deadline, onFinish, initialAnswers, onProgress }: {
  items: TcfItem[];
  mode: "practice" | "exam";
  deadline?: number;
  onFinish: (answers: McqAnswer[]) => void;
  initialAnswers?: McqAnswer[]; // resume a run (exam mode)
  onProgress?: (answers: McqAnswer[]) => void;
}) {
  const [answers, setAnswers] = useState<McqAnswer[]>(initialAnswers ?? []);
  const [picked, setPicked] = useState<number | null>(null); // shuffled index
  const [revealed, setRevealed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [plays, setPlays] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [slow, setSlow] = useState(false);
  const finished = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const i = answers.length;
  const item = items[i];
  const view = useMemo(() => (item ? shuffled(item.options, item.id) : null), [item]);

  const finish = (list: McqAnswer[]) => {
    if (finished.current) return;
    finished.current = true;
    stop();
    onFinish(list);
  };

  // Countdown; when time is up, everything unanswered counts as wrong.
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= deadline) {
        setAnswers((prev) => {
          const rest = items.slice(prev.length).map((it) => ({ id: it.id, level: it.level, correct: false, chosen: null }));
          const all = [...prev, ...rest];
          finish(all);
          return all;
        });
      }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);

  const play = async () => {
    if (!item?.audio && !item?.audioUrl) return;
    if (mode === "exam" && plays > 0) return;
    setPlays((p) => p + 1);
    setPlaying(true);
    if (item.audioUrl && audioRef.current) {
      audioRef.current.currentTime = 0;
      await audioRef.current.play().catch(() => undefined);
      await new Promise<void>((r) => audioRef.current!.addEventListener("ended", () => r(), { once: true }));
    } else await speak(item.audio!, { rate: rateForLevel(item.level) * (slow && mode === "practice" ? 0.78 : 1) });
    setPlaying(false);
  };

  // New question: reset, and in exam mode start the audio automatically (once).
  useEffect(() => {
    setPicked(null);
    setRevealed(false);
    setPlays(0);
    if (item?.skill === "listening" && mode === "exam") {
      const t = setTimeout(play, 600);
      return () => clearTimeout(t);
    }
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item || !view) return null;
  const correctShuffled = view.order.indexOf(item.answer);

  const commit = async () => {
    if (picked === null && mode === "practice") return;
    const chosen = picked === null ? null : view.order[picked];
    const correct = chosen === item.answer;
    const a: McqAnswer = { id: item.id, level: item.level, correct, chosen };
    if (mode === "practice") {
      await recordAnswer(
        { source: item.skill, itemId: item.id, prompt: item.q, correct: item.options[item.answer], given: chosen === null ? "—" : item.options[chosen] },
        correct,
      );
    }
    const next = [...answers, a];
    stop();
    setAnswers(next);
    onProgress?.(next);
    if (next.length === items.length) finish(next);
  };

  const onPick = (k: number) => {
    if (revealed) return;
    setPicked(k);
    if (mode === "practice") setRevealed(true);
  };

  const left = deadline ? Math.max(0, deadline - now) : 0;

  return (
    <div className="mcq" data-skill={item.skill}>
      <div className="mcq-top">
        <span className="small num">
          Question <b>{i + 1}</b> / {items.length}
        </span>
        {mode === "practice" && <span className="tag skill">{item.level}</span>}
        {deadline && (
          <span className={`tag ${left < 5 * 60_000 ? "bad" : ""} num`} role="timer" aria-live="off">
            <Icon name="clock" size={13} /> {fmtClock(left)}
          </span>
        )}
      </div>
      <div className="mcq-progress" aria-hidden="true"><i style={{ width: `${(i / items.length) * 100}%` }} /></div>

      {item.skill === "listening" ? (
        <div className="card mcq-audio">
          {item.audioUrl && <audio ref={audioRef} src={item.audioUrl} preload="auto" />}
          <button className={`mcq-play${playing ? " on" : ""}`} onClick={play} disabled={playing || (mode === "exam" && plays > 0)} aria-label="Play the recording">
            <Icon name={playing ? "listening" : "play"} size={30} />
          </button>
          <div className="small muted" style={{ textAlign: "center" }}>
            {playing ? "Listening…" : mode === "exam" ? (plays ? "Played. In the real exam you hear it once." : "Plays automatically, once.") : plays ? `Played ${plays}× · tap to replay` : "Tap to listen"}
          </div>
          {mode === "practice" && !item.audioUrl && (
            <div className="seg" style={{ width: "100%", maxWidth: 240 }} role="group" aria-label="Speed">
              <button aria-pressed={!slow} onClick={() => setSlow(false)}>Exam speed</button>
              <button aria-pressed={slow} onClick={() => setSlow(true)}>Slower</button>
            </div>
          )}
          {!ttsAvailable() && !item.audioUrl && <div className="notice warn small"><Icon name="alert" size={16} /> This browser has no French voice. Read the script instead: « {item.audio} »</div>}
          {mode === "practice" && revealed && item.audio && (
            <details className="small">
              <summary>Show transcript</summary>
              <p style={{ whiteSpace: "pre-line", margin: "6px 0 0" }}>{item.audio.replace(/^[AB]:\s*/gm, "— ")}</p>
            </details>
          )}
        </div>
      ) : (
        <div className="card mcq-text" lang="fr">{item.text}</div>
      )}

      <div className="mcq-q" lang="fr">{item.q}</div>
      <div className="mcq-options" role="radiogroup" aria-label="Answers">
        {view.items.map((opt, k) => {
          const state = revealed ? (k === correctShuffled ? "right" : k === picked ? "wrong" : "") : k === picked ? "picked" : "";
          return (
            <button key={k} role="radio" aria-checked={picked === k} className={`mcq-opt ${state}`} onClick={() => onPick(k)} lang="fr">
              <span className="mcq-letter">{"ABCD"[k]}</span>
              <span>{opt}</span>
              {state === "right" && <Icon name="check" size={18} stroke={2.6} />}
              {state === "wrong" && <Icon name="x" size={18} stroke={2.6} />}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div className={`notice ${picked === correctShuffled ? "" : "bad"}`}>
          <Icon name={picked === correctShuffled ? "check" : "alert"} size={18} />
          <span>
            <b>{picked === correctShuffled ? "Correct." : `Answer: ${"ABCD"[correctShuffled]}.`}</b> {item.explain ?? ""}
          </span>
        </div>
      )}

      <button className="btn dark lg block" onClick={commit} disabled={mode === "practice" ? !revealed : false}>
        {i + 1 === items.length ? "Finish" : mode === "exam" && picked === null ? "Skip" : "Next"} <Icon name="chevronR" size={18} />
      </button>
    </div>
  );
}
