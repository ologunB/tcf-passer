import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Icon } from "../components/Icon";
import { ScoreLine } from "../components/Rubric";
import { Sheet } from "../components/Sheet";
import { SpeakingAssessment, SpeakingTask } from "../components/SpeakingTask";
import { db, type Recording } from "../db";
import { SPEAKING_TASKS, speakingPrompts, type SpeakingPrompt } from "../lib/content";
import { fmtDay } from "../lib/dates";
import { fmtClock } from "../timer";
import "./writing-speaking.css";

type T = 1 | 2 | 3;
const pick = <X,>(arr: X[]) => arr[Math.floor(Math.random() * arr.length)];
const hashParams = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
const examPrompts = () => ([1, 2, 3] as T[]).map((t) => pick(speakingPrompts.filter((p) => p.task === t)));

const ABOUT: Record<T, string> = {
  1: "The examiner asks about you: family, work, hobbies, plans. Answer in full sentences and add details.",
  2: "A role-play where YOU ask the examiner questions to get information. Politeness (vous) and variety of questions count.",
  3: "You get a question and must give your opinion, with arguments and examples, for 4½ minutes.",
};

export function SpeakingPage({ today }: { today: string }) {
  const params = useMemo(hashParams, []);
  const [task, setTask] = useState<T>(() => (Number(params.get("task")) as T) || 1);
  const [active, setActive] = useState<{ prompt: SpeakingPrompt; n: number } | null>(() => {
    const p = speakingPrompts.find((x) => x.id === params.get("prompt"));
    return p ? { prompt: p, n: 0 } : null;
  });
  const [exam, setExam] = useState<SpeakingPrompt[] | null>(() => (params.get("exam") ? examPrompts() : null));
  const [openId, setOpenId] = useState<number | null>(null);
  const history = useLiveQuery(() => db.recordings.orderBy("id").reverse().limit(50).toArray(), []);

  if (exam) return <SpeakingExam prompts={exam} today={today} onExit={() => setExam(null)} />;

  if (active)
    return (
      <div className="page">
        <header className="ws-back">
          <button className="icon-btn" onClick={() => setActive(null)} aria-label="Back to prompts"><Icon name="chevronL" size={20} /></button>
          <div>
            <div className="eyebrow">Oral · practice</div>
            <h1 className="title">Tâche {active.prompt.task}<em>.</em></h1>
          </div>
        </header>
        <SpeakingTask key={`${active.prompt.id}-${active.n}`} prompt={active.prompt} context="practice" today={today} />
        <button className="btn ghost block" onClick={() => setActive({ prompt: pick(speakingPrompts.filter((p) => p.task === active.prompt.task)), n: active.n + 1 })}>
          Try another task {active.prompt.task} prompt
        </button>
      </div>
    );

  const prompts = speakingPrompts.filter((p) => p.task === task);
  const themes = [...new Set(prompts.map((p) => p.theme))];
  const cfg = SPEAKING_TASKS[task];
  const open = history?.find((r) => r.id === openId);

  return (
    <div className="page" data-skill="speaking">
      <header className="page-head">
        <div>
          <div className="eyebrow">Expression orale · 3 tasks · ~12 min</div>
          <h1 className="title">Oral<em>.</em></h1>
        </div>
      </header>

      <section className="focus" data-skill="speaking">
        <div className="focus-label"><Icon name="exam" size={14} /> Exam conditions</div>
        <div className="focus-title">Full speaking exam (3 tasks, ~12 min)</div>
        <p className="muted small" style={{ margin: 0 }}>Three recorded tasks back to back with the real timings and no pausing. Find a quiet spot and use headphones if you can.</p>
        <div className="focus-actions">
          <button className="btn primary lg block" onClick={() => setExam(examPrompts())}><Icon name="play" size={16} /> Start the speaking exam</button>
        </div>
      </section>

      <div className="seg" role="group" aria-label="Task">
        {([1, 2, 3] as T[]).map((t) => (
          <button key={t} aria-pressed={task === t} onClick={() => setTask(t)}>Task {t}</button>
        ))}
      </div>

      <div className="card">
        <h3>{cfg.label}</h3>
        <p className="muted small" style={{ margin: "0 0 12px" }}>
          <b>{cfg.prepSec ? `${fmtClock(cfg.prepSec * 1000)} prep + ` : "No prep · "}{fmtClock(cfg.speakSec * 1000)} speaking.</b> {ABOUT[task]}
        </p>
        <button className="btn dark block" onClick={() => setActive({ prompt: pick(prompts), n: Date.now() })} disabled={!prompts.length}>
          <Icon name="sparkle" size={16} /> Random task {task} prompt
        </button>
      </div>

      {themes.map((th) => (
        <div key={th} style={{ display: "grid", gap: 8 }}>
          <div className="list-label ws-theme">{th}</div>
          <div className="list">
            {prompts.filter((p) => p.theme === th).map((p) => (
              <button key={p.id} className="list-row" onClick={() => setActive({ prompt: p, n: 0 })}>
                <span className="ws-row-txt">
                  <b>{p.title}</b>
                  <span className="ws-row-meta"><span className="tag">{p.level}</span> {history?.some((r) => r.promptId === p.id) && <span className="tag good">done</span>}</span>
                </span>
                <Icon name="chevronR" size={18} />
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="section-title"><h2>History</h2><span>{history?.length ?? 0} recordings</span></div>
      {history?.length ? (
        <div className="list">
          {history.map((r) => <HistoryRow key={r.id} r={r} onOpen={() => setOpenId(r.id!)} />)}
        </div>
      ) : (
        <div className="card empty">Your recordings and their scores will appear here.</div>
      )}

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? `Task ${open.task} · ${fmtDay(open.date)}` : ""}>
        {open && (
          <>
            <SpeakingAssessment key={open.id} id={open.id!} today={today} />
            <button className="btn ghost danger block" onClick={() => { if (confirm("Delete this recording and its feedback?")) { void db.recordings.delete(open.id!); setOpenId(null); } }}>
              <Icon name="trash" size={16} /> Delete
            </button>
          </>
        )}
      </Sheet>
    </div>
  );
}

function HistoryRow({ r, onOpen }: { r: Recording; onOpen: () => void }) {
  const p = speakingPrompts.find((x) => x.id === r.promptId);
  return (
    <button className="list-row" onClick={onOpen}>
      <span className="ws-row-txt">
        <b>{p?.title ?? `Task ${r.task}`}</b>
        <span className="ws-row-meta">
          <span>{fmtDay(r.date, { day: "numeric", month: "short" })} · Task {r.task}</span>
          <span className="tag num">{fmtClock(r.durationSec * 1000)}</span>
          {r.context !== "practice" && <span className="tag brand">{r.context}</span>}
          {r.selfScore != null && <span className="tag">self {r.selfScore}/20</span>}
          {r.aiScore != null && <span className="tag skill">AI {r.aiScore}/20</span>}
        </span>
      </span>
      <Icon name="play" size={16} />
    </button>
  );
}

function SpeakingExam({ prompts, today, onExit }: { prompts: SpeakingPrompt[]; today: string; onExit: () => void }) {
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState<(number | null)[]>([null, null, null]);
  const done = step >= 3;
  const rows = useLiveQuery(() => (done ? db.recordings.bulkGet(saved as number[]) : []), [done, saved.join()]);
  const scores = (rows ?? []).map((r) => r?.aiScore ?? r?.selfScore);
  const avg = scores.length === 3 && scores.every((s) => s != null) ? Math.round(((scores as number[]).reduce((a, b) => a + b, 0) / 3) * 2) / 2 : null;

  return (
    <div className="page" data-skill="speaking">
      <header className="page-head">
        <div>
          <div className="eyebrow">Full speaking exam{!done && ` · task ${step + 1} of 3`}</div>
          <h1 className="title">{done ? "Results" : "Oral"}<em>.</em></h1>
        </div>
        {!done && <button className="btn ghost" onClick={() => { if (confirm("Quit the exam? Tasks already recorded stay in your history.")) onExit(); }}>Quit</button>}
      </header>

      {!done && (
        <>
          <div className="seg" aria-hidden="true">
            {prompts.map((p, i) => <button key={p.id} tabIndex={-1} aria-pressed={i === step}>{saved[i] != null ? "✓ " : ""}Task {p.task}</button>)}
          </div>
          <SpeakingTask
            key={step}
            prompt={prompts[step]}
            context="mock"
            today={today}
            examMode
            assess={false}
            onSaved={(id) => setSaved((s) => s.map((x, j) => (j === step ? id : x)))}
          />
          {saved[step] != null && (
            <button className="btn primary lg block" onClick={() => setStep(step + 1)}>
              {step < 2 ? <>Next: task {step + 2} <Icon name="chevronR" size={16} /></> : "See results"}
            </button>
          )}
        </>
      )}

      {done && (
        <>
          <div className="notice"><Icon name="check" size={18} /><span>All three tasks recorded. Listen back to each, fix the transcript, then rate yourself and ask the AI examiner.</span></div>
          {avg != null && <div className="card"><ScoreLine score={avg} skill="speaking" label="Exam estimate (average of 3 tasks)" /></div>}
          {prompts.map((p, i) => (
            <div key={p.id} style={{ display: "grid", gap: 10 }}>
              <div className="ws-result-head section-title"><h2>Task {p.task}</h2><span>{p.title}</span></div>
              {saved[i] != null && <SpeakingAssessment id={saved[i]!} prompt={p} today={today} />}
            </div>
          ))}
          <button className="btn primary lg block" onClick={onExit}>Done</button>
        </>
      )}
    </div>
  );
}
