import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { ScoreLine } from "../components/Rubric";
import { useCountdown, WritingAssessment, WritingTask } from "../components/WritingTask";
import { db, type Writing } from "../db";
import { WRITING_TASKS, WRITING_TOTAL_MIN, writingPrompts, type WritingPrompt } from "../lib/content";
import { fmtDay } from "../lib/dates";
import { fmtClock } from "../timer";
import "./writing-speaking.css";

type T = 1 | 2 | 3;
const EXAM_KEY = "tcf-writing-exam";
interface Exam { deadline: number; ids: string[] }

const hashParams = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
const pick = <X,>(arr: X[]) => arr[Math.floor(Math.random() * arr.length)];
const loadExam = (): Exam | null => {
  try {
    const e = JSON.parse(localStorage.getItem(EXAM_KEY) ?? "null") as Exam | null;
    return e && Array.isArray(e.ids) && e.ids.every((id) => writingPrompts.some((p) => p.id === id)) ? e : null;
  } catch {
    return null;
  }
};
const saveExam = (e: Exam | null) => {
  try {
    if (e) localStorage.setItem(EXAM_KEY, JSON.stringify(e));
    else localStorage.removeItem(EXAM_KEY);
  } catch { /* storage unavailable */ }
};
const newExam = (): Exam => ({
  deadline: Date.now() + WRITING_TOTAL_MIN * 60_000,
  ids: ([1, 2, 3] as T[]).map((t) => pick(writingPrompts.filter((p) => p.task === t)).id),
});

export function WritingPage({ today }: { today: string }) {
  const params = useMemo(hashParams, []);
  const [task, setTask] = useState<T>(() => (Number(params.get("task")) as T) || 1);
  const [active, setActive] = useState<{ prompt: WritingPrompt; n: number } | null>(() => {
    const p = writingPrompts.find((x) => x.id === params.get("prompt"));
    return p ? { prompt: p, n: 0 } : null;
  });
  const [exam, setExam] = useState<Exam | null>(() => loadExam() ?? (params.get("exam") ? newExam() : null));
  const [openId, setOpenId] = useState<number | null>(null);
  const history = useLiveQuery(() => db.writings.orderBy("id").reverse().limit(50).toArray(), []);

  const startExam = () => {
    const e = newExam();
    saveExam(e);
    setExam(e);
  };
  if (exam) return <WritingExam exam={exam} today={today} onExit={() => { saveExam(null); setExam(null); }} />;

  if (active)
    return (
      <div className="page">
        <header className="ws-back">
          <button className="icon-btn" onClick={() => setActive(null)} aria-label="Back to prompts"><Icon name="chevronL" size={20} /></button>
          <div>
            <div className="eyebrow">Écriture · practice</div>
            <h1 className="title">Tâche {active.prompt.task}<em>.</em></h1>
          </div>
        </header>
        <WritingTask key={`${active.prompt.id}-${active.n}`} prompt={active.prompt} context="practice" today={today} />
        <button className="btn ghost block" onClick={() => setActive({ prompt: pick(writingPrompts.filter((p) => p.task === active.prompt.task)), n: active.n + 1 })}>
          Try another task {active.prompt.task} prompt
        </button>
      </div>
    );

  const prompts = writingPrompts.filter((p) => p.task === task);
  const themes = [...new Set(prompts.map((p) => p.theme))];
  const rule = WRITING_TASKS[task];
  const open = history?.find((w) => w.id === openId);

  return (
    <div className="page" data-skill="writing">
      <header className="page-head">
        <div>
          <div className="eyebrow">Expression écrite · 3 tasks · 60 min</div>
          <h1 className="title">Écriture<em>.</em></h1>
        </div>
      </header>

      <section className="focus" data-skill="writing">
        <div className="focus-label"><Icon name="exam" size={14} /> Exam conditions</div>
        <div className="focus-title">Full writing exam: 3 tasks · 60 min</div>
        <p className="muted small" style={{ margin: 0 }}>One clock for all three tasks, like the real test. Everything is handed in automatically when time runs out, then you grade each task.</p>
        <div className="focus-actions">
          <button className="btn primary lg block" onClick={startExam}><Icon name="play" size={16} /> Start the 60-minute exam</button>
        </div>
      </section>

      <div className="seg" role="group" aria-label="Task">
        {([1, 2, 3] as T[]).map((t) => (
          <button key={t} aria-pressed={task === t} onClick={() => setTask(t)}>Task {t}</button>
        ))}
      </div>

      <div className="card">
        <h3>{rule.label}</h3>
        <p className="muted small" style={{ margin: "0 0 12px" }}>
          <b>{rule.min}–{rule.max} words</b> · about {rule.suggestMin} min in the exam.{" "}
          {task === 1 && "A short message to a friend or contact: invite, inform, ask."}
          {task === 2 && "An article, blog post or letter telling an experience, with some description and opinion."}
          {task === 3 && "Sum up two documents with opposite views, then give and justify your own opinion."}
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
                  <span className="ws-row-meta"><span className="tag">{p.level}</span> {history?.some((w) => w.promptId === p.id) && <span className="tag good">done</span>}</span>
                </span>
                <Icon name="chevronR" size={18} />
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="section-title"><h2>History</h2><span>{history?.length ?? 0} texts</span></div>
      {history?.length ? (
        <div className="list">
          {history.map((w) => <HistoryRow key={w.id} w={w} onOpen={() => setOpenId(w.id!)} />)}
        </div>
      ) : (
        <div className="card empty">Your submitted texts and their scores will appear here.</div>
      )}

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? `Task ${open.task} · ${fmtDay(open.date)}` : ""}>
        {open && (
          <>
            <WritingAssessment id={open.id!} today={today} />
            <button className="btn ghost danger block" onClick={() => { if (confirm("Delete this text and its feedback?")) { void db.writings.delete(open.id!); setOpenId(null); } }}>
              <Icon name="trash" size={16} /> Delete
            </button>
          </>
        )}
      </Sheet>
    </div>
  );
}

function HistoryRow({ w, onOpen }: { w: Writing; onOpen: () => void }) {
  const p = writingPrompts.find((x) => x.id === w.promptId);
  const r = WRITING_TASKS[w.task];
  const out = w.words < r.min || w.words > r.max;
  return (
    <button className="list-row" onClick={onOpen}>
      <span className="ws-row-txt">
        <b>{p?.title ?? `Task ${w.task}`}</b>
        <span className="ws-row-meta">
          <span>{fmtDay(w.date, { day: "numeric", month: "short" })} · Task {w.task}</span>
          <span className={`tag ${out ? "bad" : ""}`}>{w.words} words</span>
          {w.context !== "practice" && <span className="tag brand">{w.context}</span>}
          {w.selfScore != null && <span className="tag">self {w.selfScore}/20</span>}
          {w.aiScore != null && <span className="tag skill">AI {w.aiScore}/20</span>}
        </span>
      </span>
      <Icon name="chevronR" size={18} />
    </button>
  );
}

function WritingExam({ exam, today, onExit }: { exam: Exam; today: string; onExit: () => void }) {
  const prompts = exam.ids.map((id) => writingPrompts.find((p) => p.id === id)!);
  const [deadline, setDeadline] = useState(exam.deadline);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState<(number | null)[]>([null, null, null]);
  const left = useCountdown(deadline);
  const done = saved.every((s) => s != null);
  // Once handed in, a reload must not resume (and re-submit) the exam.
  useEffect(() => { if (done) saveExam(null); }, [done]);
  const rows = useLiveQuery(() => (done ? db.writings.bulkGet(saved as number[]) : []), [done, saved.join()]);

  const handIn = () => {
    if (confirm("Hand in all three tasks now? You can't edit them afterwards.")) setDeadline(Date.now());
  };
  const onSaved = (i: number) => (id: number) => setSaved((s) => s.map((x, j) => (j === i ? id : x)));
  const scores = (rows ?? []).map((w) => w?.aiScore ?? w?.selfScore);
  const avg = scores.length === 3 && scores.every((s) => s != null) ? Math.round(((scores as number[]).reduce((a, b) => a + b, 0) / 3) * 2) / 2 : null;

  return (
    <div className="page" data-skill="writing">
      <header className="page-head">
        <div>
          <div className="eyebrow">Full writing exam</div>
          <h1 className="title">{done ? "Results" : "Écriture"}<em>.</em></h1>
        </div>
        {!done && <button className="btn ghost" onClick={() => { if (confirm("Quit the exam? Your drafts stay on this device.")) onExit(); }}>Quit</button>}
      </header>

      {!done && (
        <div className="ws-exam-bar">
          <div className="ws-exam-top">
            <div>
              <div className={`ws-exam-clock num${left < 5 * 60_000 ? " low" : ""}`}>{fmtClock(Math.max(0, left))}</div>
              <div className="muted tiny">left for all 3 tasks</div>
            </div>
            <button className="btn dark" onClick={handIn}><Icon name="check" size={16} stroke={2.6} /> Hand in</button>
          </div>
          <div className="seg" role="group" aria-label="Task">
            {prompts.map((p, i) => (
              <button key={p.id} aria-pressed={step === i} onClick={() => setStep(i)}>Task {p.task}</button>
            ))}
          </div>
        </div>
      )}

      {!done && left <= 0 && <div className="notice"><Icon name="hourglass" size={18} /><span>Time's up. Handing in…</span></div>}

      {prompts.map((p, i) => (
        <div key={p.id} hidden={done || i !== step}>
          <WritingTask prompt={p} context="mock" today={today} deadline={deadline} showTimer={false} assess={false} onSaved={onSaved(i)} />
        </div>
      ))}

      {!done && (
        <div className="ws-actions">
          <button className="btn soft" disabled={step === 0} onClick={() => setStep(step - 1)}><Icon name="chevronL" size={16} /> Previous</button>
          <button className="btn soft" disabled={step === 2} onClick={() => setStep(step + 1)}>Next <Icon name="chevronR" size={16} /></button>
        </div>
      )}

      {done && (
        <>
          <div className="notice"><Icon name="check" size={18} /><span>All three tasks handed in. Grade each one below: rate yourself, and use the AI examiner if you have a key.</span></div>
          {avg != null && <div className="card"><ScoreLine score={avg} skill="writing" label="Exam estimate (average of 3 tasks)" /></div>}
          {prompts.map((p, i) => (
            <div key={p.id} style={{ display: "grid", gap: 10 }}>
              <div className="ws-result-head section-title"><h2>Task {p.task}</h2><span>{p.title}</span></div>
              <WritingAssessment id={saved[i]!} prompt={p} today={today} />
            </div>
          ))}
          <button className="btn primary lg block" onClick={onExit}>Done</button>
        </>
      )}
    </div>
  );
}
