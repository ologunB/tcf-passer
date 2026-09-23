import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { McqRunner, type McqAnswer } from "../components/McqRunner";
import { db } from "../db";
import { pickItems, tcfItems, type TcfItem } from "../lib/content";
import { logStudy } from "../lib/logStudy";
import { cefrFromScore, fmtNclc, levelScore, LEVELS, nclcFor } from "../lib/scoring";
import { go } from "../router";

type SkillName = "listening" | "reading";
const RANGES: Record<string, string[]> = {
  "A1–A2": ["A1", "A2"],
  "A2–B1": ["A2", "B1"],
  "B1–B2": ["B1", "B2"],
  "B2–C2": ["B2", "C1", "C2"],
  "Full range": [...LEVELS],
};
// Real timing: 35 min / 39 items for listening, 60 min / 39 for reading.
const SEC_PER_ITEM: Record<SkillName, number> = { listening: (35 * 60) / 39, reading: (60 * 60) / 39 };

export function PracticePage({ today, params }: { today: string; params: URLSearchParams }) {
  const skill: SkillName = params.get("skill") === "reading" ? "reading" : "listening";
  const attempts = useLiveQuery(() => db.attempts.where("skill").equals(skill).reverse().sortBy("id"), [skill]);
  const [range, setRange] = useState("A1–A2");
  const [count, setCount] = useState(10);
  const [timed, setTimed] = useState(false);
  const [run, setRun] = useState<{ items: TcfItem[]; start: number; deadline?: number } | null>(null);
  const [result, setResult] = useState<{ answers: McqAnswer[]; score: number } | null>(null);

  const levels = RANGES[range];
  const available = tcfItems.filter((i) => i.skill === skill && levels.includes(i.level)).length;

  const start = () => {
    const seen = new Set((attempts ?? []).slice(0, 6).flatMap((a) => a.items.map((i) => i.id)));
    const per = Math.ceil(count / levels.length);
    const items = pickItems(skill, Object.fromEntries(levels.map((l) => [l, per])), seen).slice(0, count);
    setResult(null);
    setRun({ items, start: Date.now(), deadline: timed ? Date.now() + items.length * SEC_PER_ITEM[skill] * 1000 : undefined });
  };

  const finish = async (answers: McqAnswer[]) => {
    const score = levelScore(answers);
    const durationSec = Math.round((Date.now() - run!.start) / 1000);
    await db.attempts.add({ date: today, kind: "practice", skill, items: answers.map(({ id, level, correct }) => ({ id, level, correct })), score, nclc: nclcFor(skill, score), durationSec });
    await logStudy(today, "tcf", "exam", durationSec / 60, `${skill} practice: ${answers.filter((a) => a.correct).length}/${answers.length}`);
    setResult({ answers, score });
    setRun(null);
  };

  const label = skill === "listening" ? "Compréhension orale" : "Compréhension écrite";

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><a href="#/study">Study</a> · TCF practice</div>
          <h1 className="title">{skill === "listening" ? "Écoute" : "Lecture"}<em>.</em></h1>
        </div>
        {run && <button className="btn ghost" onClick={() => setRun(null)}>Quit</button>}
      </header>

      {run ? (
        <McqRunner items={run.items} mode={timed ? "exam" : "practice"} deadline={run.deadline} onFinish={finish} />
      ) : (
        <>
          {result && <Result answers={result.answers} score={result.score} skill={skill} />}
          <div className="seg" role="group" aria-label="Section">
            {(["listening", "reading"] as const).map((s) => (
              <button key={s} aria-pressed={skill === s} onClick={() => go(`practice?skill=${s}`)}>
                <Icon name={s} size={15} /> {s === "listening" ? "Listening" : "Reading"}
              </button>
            ))}
          </div>
          <section className="card" data-skill={skill} style={{ display: "grid", gap: 14 }}>
            <div>
              <div className="eyebrow" style={{ color: "var(--c)" }}>{label}</div>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Original TCF-style questions, easiest first. {skill === "listening" ? "Audio is read by your phone's French voice." : ""}
              </p>
            </div>
            <div className="field">Level
              <div className="chips">{Object.keys(RANGES).map((r) => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>)}</div>
            </div>
            <div className="field">Questions
              <div className="chips">{[5, 10, 20, 39].map((n) => <button key={n} aria-pressed={count === n} onClick={() => setCount(n)}>{n}</button>)}</div>
            </div>
            <div className="seg" role="group" aria-label="Mode">
              <button aria-pressed={!timed} onClick={() => setTimed(false)}>Practice: feedback each time</button>
              <button aria-pressed={timed} onClick={() => setTimed(true)}>Exam: timed{skill === "listening" ? ", hear once" : ""}</button>
            </div>
            {available < count && <p className="muted tiny" style={{ margin: 0 }}>Only {available} questions exist at this level so far. You'll get all of them.</p>}
            <button className="btn primary lg block" onClick={start}><Icon name="play" size={16} /> Start {Math.min(count, available)} questions</button>
          </section>
          <div className="notice">
            <Icon name="external" size={18} />
            <span>Want more? The free official-style simulator from TV5Monde has 600 questions: <a href="https://apprendre.tv5monde.com/fr/tcf" target="_blank" rel="noreferrer">apprendre.tv5monde.com/fr/tcf</a></span>
          </div>
          {!!attempts?.length && (
            <>
              <div className="section-title"><h2>Recent sets</h2></div>
              <section className="card flush">
                <ul className="tasks">
                  {attempts.slice(0, 8).map((a) => (
                    <li key={a.id} className="task">
                      <span className="task-text">
                        <span className="task-title num">{a.items.filter((i) => i.correct).length}/{a.items.length} right · ~{a.score}</span>
                        <span className="task-meta"><span>{a.date}</span><span>· {a.kind}</span><span>· {Math.round(a.durationSec / 60)} min</span></span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Result({ answers, score, skill }: { answers: McqAnswer[]; score: number; skill: SkillName }) {
  const right = answers.filter((a) => a.correct).length;
  const levels = LEVELS.filter((l) => answers.some((a) => a.level === l));
  return (
    <section className="card" data-skill={skill}>
      <div className="spread" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="focus-title num" style={{ margin: 0 }}>{right} / {answers.length}</div>
        <span className="tag skill num">≈ {score} · {cefrFromScore(score)} · NCLC {fmtNclc(nclcFor(skill, score))}</span>
      </div>
      <div className="task-meta" style={{ marginTop: 8 }}>
        {levels.map((l) => {
          const at = answers.filter((a) => a.level === l);
          return <span key={l} className="tag num">{l}: {at.filter((a) => a.correct).length}/{at.length}</span>;
        })}
      </div>
      <p className="muted tiny" style={{ margin: "10px 0 0" }}>
        A short set only proves the levels it asked, so the score is a rough estimate. Your official-style estimate comes from progress checks and mock exams. Wrong answers are in the mistake bank.
      </p>
    </section>
  );
}
