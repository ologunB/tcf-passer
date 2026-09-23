import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef } from "react";
import { Icon } from "../components/Icon";
import { McqRunner, type McqAnswer } from "../components/McqRunner";
import { SpeakingTask } from "../components/SpeakingTask";
import { WritingTask } from "../components/WritingTask";
import { completeTask, db, recordAnswer, setSetting } from "../db";
import { useSetting } from "../hooks";
import { pickItems, speakingPrompts, tcfItems, writingPrompts, WRITING_TASKS, type TcfItem } from "../lib/content";
import { addDays } from "../lib/dates";
import { eventLabel } from "../lib/labels";
import { findWeek, plan } from "../lib/plan";
import { cefrFrom20, cefrFromScore, fmtNclc, levelScore, nclcFor } from "../lib/scoring";
import { go } from "../router";

type Kind = "placement" | "progress";
type Step = "listening" | "reading" | "writing" | "speaking" | "results";

interface CheckRun {
  kind: Kind;
  step: Step;
  startedAt: number;
  L: { ids: string[]; answers: McqAnswer[]; deadline?: number };
  R: { ids: string[]; answers: McqAnswer[]; deadline?: number };
  writingPrompt: string;
  speakingPrompt: string;
  writingId?: number;
  recordingId?: number;
  wSkipped?: boolean;
  sSkipped?: boolean;
  wDeadline?: number;
  saved?: boolean;
}

const TWO_EACH = { A1: 2, A2: 2, B1: 2, B2: 2, C1: 2, C2: 2 };
const SEC = { listening: (35 * 60) / 39, reading: (60 * 60) / 39 };
const byIds = (ids: string[]) => ids.map((id) => tcfItems.find((i) => i.id === id)).filter(Boolean) as TcfItem[];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function CheckPage({ today, params }: { today: string; params: URLSearchParams }) {
  const kind: Kind = params.get("kind") === "placement" ? "placement" : "progress";
  const running = params.get("run") === "1";
  const run = useSetting<CheckRun | null>("checkRun", null);
  const past = useLiveQuery(() => db.estimates.filter((e) => e.source === "placement" || e.source === "check").toArray(), []);
  const save = (r: CheckRun | null) => setSetting("checkRun", r);
  const week = today < plan.start ? 1 : (findWeek(plan, today)?.week ?? 1);

  const begin = async () => {
    const seen = new Set((await db.attempts.toArray()).flatMap((a) => a.items.map((i) => i.id)));
    // Task type follows the plan: task 1 early, task 2 from B1, task 3 from B2.
    const task = kind === "placement" || week < 13 ? 1 : week < 23 ? 2 : 3;
    const r: CheckRun = {
      kind,
      step: "listening",
      startedAt: Date.now(),
      L: { ids: pickItems("listening", TWO_EACH, seen).map((i) => i.id), answers: [] },
      R: { ids: pickItems("reading", TWO_EACH, seen).map((i) => i.id), answers: [] },
      writingPrompt: pick(writingPrompts.filter((p) => p.task === task)).id,
      speakingPrompt: pick(speakingPrompts.filter((p) => p.task === task)).id,
    };
    r.L.deadline = Date.now() + r.L.ids.length * SEC.listening * 1000;
    await save(r);
    go(`check?kind=${kind}&run=1`);
  };

  if (!running || !run) return <Intro kind={kind} today={today} past={past?.length ?? 0} resume={run && !running ? () => go(`check?kind=${run.kind}&run=1`) : undefined} onStart={begin} />;

  const next = (patch: Partial<CheckRun>) => save({ ...run, ...patch });
  const wPrompt = writingPrompts.find((p) => p.id === run.writingPrompt)!;
  const sPrompt = speakingPrompts.find((p) => p.id === run.speakingPrompt)!;
  const steps: Step[] = ["listening", "reading", "writing", "speaking", "results"];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{run.kind === "placement" ? "Placement test" : "Progress check"} · step {steps.indexOf(run.step) + 1} of 5</div>
          <h1 className="title">{{ listening: "Écoute", reading: "Lecture", writing: "Écriture", speaking: "Oral", results: "Résultats" }[run.step]}<em>.</em></h1>
        </div>
        {run.step !== "results" && (
          <button className="btn ghost" onClick={() => confirm("Stop the test? Your answers so far will be lost.") && save(null).then(() => go("study"))}>Stop</button>
        )}
      </header>

      {run.step === "listening" && (
        <McqRunner
          key="L"
          items={byIds(run.L.ids)}
          mode="exam"
          deadline={run.L.deadline}
          initialAnswers={run.L.answers}
          onProgress={(answers) => next({ L: { ...run.L, answers } })}
          onFinish={(answers) =>
            next({ step: "reading", L: { ...run.L, answers }, R: { ...run.R, deadline: Date.now() + run.R.ids.length * SEC.reading * 1000 } })
          }
        />
      )}
      {run.step === "reading" && (
        <McqRunner
          key="R"
          items={byIds(run.R.ids)}
          mode="exam"
          deadline={run.R.deadline}
          initialAnswers={run.R.answers}
          onProgress={(answers) => next({ R: { ...run.R, answers } })}
          onFinish={(answers) => next({ step: "writing", R: { ...run.R, answers }, wDeadline: Date.now() + WRITING_TASKS[wPrompt.task].suggestMin * 60_000 })}
        />
      )}
      {run.step === "writing" && (
        <>
          {run.writingId === undefined && (
            <button className="btn soft block" onClick={() => next({ step: "speaking", wSkipped: true })}>
              I can't write in French yet: skip (counts as 0)
            </button>
          )}
          <WritingTask prompt={wPrompt} context="check" today={today} deadline={run.wDeadline} showTimer onSaved={(id) => next({ writingId: id })} />
          <ScoredGate table="writings" id={run.writingId} label="Next: speaking" onNext={() => next({ step: "speaking" })} />
        </>
      )}
      {run.step === "speaking" && (
        <>
          {run.recordingId === undefined && (
            <button className="btn soft block" onClick={() => next({ step: "results", sSkipped: true })}>
              I can't speak French yet: skip (counts as 0)
            </button>
          )}
          <SpeakingTask prompt={sPrompt} context="check" today={today} onSaved={(id) => next({ recordingId: id })} />
          <ScoredGate table="recordings" id={run.recordingId} label="See my results" onNext={() => next({ step: "results" })} />
        </>
      )}
      {run.step === "results" && <Results run={run} today={today} onSaved={() => next({ saved: true })} onDone={() => save(null).then(() => go("log"))} />}
    </div>
  );
}

/** "Continue" appears once the saved writing/recording has a score (self-assessed or AI). */
function ScoredGate({ table, id, label, onNext }: { table: "writings" | "recordings"; id?: number; label: string; onNext: () => void }) {
  const row = useLiveQuery(async (): Promise<{ selfScore?: number; aiScore?: number } | undefined> => {
    if (id === undefined) return undefined;
    return table === "writings" ? db.writings.get(id) : db.recordings.get(id);
  }, [table, id]);
  if (id === undefined) return null;
  const scored = row && (row.selfScore !== undefined || row.aiScore !== undefined);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {!scored && <p className="muted small" style={{ margin: 0, textAlign: "center" }}>Score yourself with the rubric above (or grade with AI) to continue.</p>}
      <button className="btn primary lg block" disabled={!scored} onClick={onNext}>{label} <Icon name="chevronR" size={18} /></button>
    </div>
  );
}

function Results({ run, today, onSaved, onDone }: { run: CheckRun; today: string; onSaved: () => void; onDone: () => void }) {
  const w = useLiveQuery(() => (run.writingId !== undefined ? db.writings.get(run.writingId) : undefined), [run.writingId]);
  const s = useLiveQuery(() => (run.recordingId !== undefined ? db.recordings.get(run.recordingId) : undefined), [run.recordingId]);
  const L = levelScore(run.L.answers);
  const R = levelScore(run.R.answers);
  const W = run.wSkipped ? 0 : (w?.aiScore ?? w?.selfScore ?? 0);
  const S = run.sSkipped ? 0 : (s?.aiScore ?? s?.selfScore ?? 0);
  const ready = (run.wSkipped || w) && (run.sSkipped || s);

  const rows = [
    { skill: "listening" as const, score: L, cefr: cefrFromScore(L), of: "/699" },
    { skill: "reading" as const, score: R, cefr: cefrFromScore(R), of: "/699" },
    { skill: "writing" as const, score: W, cefr: cefrFrom20(W), of: "/20" },
    { skill: "speaking" as const, score: S, cefr: cefrFrom20(S), of: "/20" },
  ].map((r) => ({ ...r, nclc: nclcFor(r.skill, r.score) }));

  const persist = async () => {
    if (run.saved || !ready) return;
    const source = run.kind === "placement" ? "placement" : "check";
    const kind = run.kind === "placement" ? "placement" : "check";
    const minutes = Math.round((Date.now() - run.startedAt) / 60_000);
    await db.transaction("rw", [db.estimates, db.attempts, db.mistakes, db.entries], async () => {
      for (const r of rows) await db.estimates.add({ date: today, skill: r.skill, nclc: r.nclc, score: r.score, source });
      for (const [skill, sec] of [["listening", run.L], ["reading", run.R]] as const) {
        await db.attempts.add({ date: today, kind, skill, items: sec.answers.map(({ id, level, correct }) => ({ id, level, correct })), score: levelScore(sec.answers), nclc: nclcFor(skill, levelScore(sec.answers)), durationSec: 0 });
        for (const a of sec.answers.filter((x) => !x.correct)) {
          const it = tcfItems.find((i) => i.id === a.id)!;
          await recordAnswer({ source: skill, itemId: it.id, prompt: it.q, correct: it.options[it.answer], given: a.chosen === null ? "—" : it.options[a.chosen] }, false);
        }
      }
      // Tick the matching plan event (the placement on day 1, or the nearest progress check).
      const type = run.kind === "placement" ? "placement" : "progress-check";
      const ev = plan.weeks.flatMap((wk) => wk.days.flatMap((d) => d.events)).filter((e) => e.type === type && e.date <= addDays(today, 3)).at(-1);
      if (ev) await completeTask(`${ev.date}-ev-${ev.type}`, today, "exam", Math.max(10, minutes), `${eventLabel[type]} done`);
    });
    onSaved();
  };

  const saving = useRef(false);
  useEffect(() => {
    if (!ready || run.saved || saving.current) return;
    saving.current = true;
    persist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, run.saved]);

  const weakest = rows.reduce((a, r) => (r.nclc < a.nclc ? r : a));
  return (
    <>
      <section className="card">
        <div className="eyebrow">Your level today</div>
        <div className="grid-2" style={{ marginTop: 10 }}>
          {rows.map((r) => (
            <div key={r.skill} className="skill-tile" data-skill={r.skill}>
              <div className="lbl"><Icon name={r.skill} size={14} /> {r.skill[0].toUpperCase() + r.skill.slice(1)}</div>
              <div className="val num">NCLC {fmtNclc(r.nclc)}</div>
              <div className="tiny muted num">{r.score}{r.of} · {r.cefr}</div>
            </div>
          ))}
        </div>
        <p className="small" style={{ margin: "12px 0 0" }}>
          {rows.every((r) => r.nclc >= 7)
            ? "All four skills are at NCLC 7 or above. Keep pushing for 8 as a safety margin."
            : `Your level is set by your weakest skill: ${weakest.skill} (NCLC ${fmtNclc(weakest.nclc)}). The plan will lean on it.`}
        </p>
        {run.kind === "placement" && rows.every((r) => r.nclc < 4) && (
          <p className="muted small" style={{ margin: "8px 0 0" }}>Starting from zero is exactly what the plan expects. This is your baseline: the first progress check is in two weeks.</p>
        )}
      </section>
      <p className="muted tiny" style={{ margin: "0 4px" }}>
        Listening and reading use 12 questions each (2 per level), so treat them as estimates. Writing and speaking use your rubric or AI score. Wrong answers are in the mistake bank.
      </p>
      <button className="btn dark lg block" disabled={!run.saved} onClick={onDone}>{run.saved ? "See my progress" : "Saving…"}</button>
    </>
  );
}

function Intro({ kind, past, resume, onStart }: { kind: Kind; today: string; past: number; resume?: () => void; onStart: () => void }) {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><a href="#/study">Study</a> · {past ? `${Math.round(past / 4)} done so far` : "first one"}</div>
          <h1 className="title">{kind === "placement" ? "Placement" : "Check-up"}<em>.</em></h1>
        </div>
      </header>
      {resume && (
        <button className="notice warn" onClick={resume} style={{ border: 0, textAlign: "left", font: "inherit", cursor: "pointer" }}>
          <Icon name="alert" size={18} /><span><b>You have a test in progress.</b> Tap to carry on where you stopped.</span>
        </button>
      )}
      <section className="focus" data-skill="exam">
        <div className="focus-label">About 30–45 minutes</div>
        <div className="focus-title">{kind === "placement" ? "Find your starting level" : "Update your level in all four skills"}</div>
        <ol className="small" style={{ margin: "10px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
          <li><b>Listening</b>: 12 questions, A1 → C2, each recording plays once, timed like the real exam.</li>
          <li><b>Reading</b>: 12 questions, A1 → C2, timed.</li>
          <li><b>Writing</b>: one real task type with its word limits, then score it with the rubric (or AI).</li>
          <li><b>Speaking</b>: record one real task type with its timer, then score it.</li>
        </ol>
        <p className="muted small" style={{ margin: "10px 0 0" }}>
          {kind === "placement"
            ? "Complete beginner? That's fine. Guess on the multiple choice (no penalty) and skip writing and speaking if you can't do them yet."
            : "Guess rather than leave blanks: wrong answers don't cost points in the TCF."}
        </p>
        <div className="focus-actions"><button className="btn primary lg" style={{ flex: 1 }} onClick={onStart}><Icon name="play" size={16} /> Start</button></div>
      </section>
      <div className="notice"><Icon name="listening" size={18} /><span>Use headphones in a quiet place. Your phone's French voice reads the recordings.</span></div>
    </div>
  );
}
