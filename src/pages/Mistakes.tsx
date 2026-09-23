import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Icon } from "../components/Icon";
import { McqRunner } from "../components/McqRunner";
import { Quiz, type QuizItem } from "../components/Quiz";
import { db, type Mistake } from "../db";
import { tcfItems, type TcfItem } from "../lib/content";
import { quizItemById } from "../lib/quizItems";

const LABEL: Record<Mistake["source"], string> = {
  grammar: "Grammar", conjugation: "Verbs", listening: "Listening", reading: "Reading", vocab: "Vocabulary",
};

export function MistakesPage(_: { today: string }) {
  const open = useLiveQuery(() => db.mistakes.where("resolved").equals(0).reverse().sortBy("lastSeen"), []);
  const fixed = useLiveQuery(() => db.mistakes.where("resolved").equals(1).count(), []);
  const [quiz, setQuiz] = useState<QuizItem[] | null>(null);
  const [mcq, setMcq] = useState<TcfItem[] | null>(null);
  const [msg, setMsg] = useState("");

  if (!open) return null;
  const words = open.filter((m) => m.source === "grammar" || m.source === "conjugation");
  const tcf = open.filter((m) => m.source === "listening" || m.source === "reading");

  const drillWords = () => {
    const items = words.slice(0, 15).flatMap((m) => quizItemById(m.source, m.itemId) ?? []);
    if (items.length) setQuiz(items);
  };
  const drillTcf = () => {
    const ids = new Set(tcf.slice(0, 10).map((m) => m.itemId));
    const items = tcfItems.filter((i) => ids.has(i.id));
    if (items.length) setMcq(items);
  };
  const done = (text: string) => {
    setQuiz(null);
    setMcq(null);
    setMsg(text);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><a href="#/study">Study</a> · {fixed ?? 0} fixed so far</div>
          <h1 className="title">Erreurs<em>.</em></h1>
        </div>
        {(quiz || mcq) && <button className="btn ghost" onClick={() => done("")}>Quit</button>}
      </header>

      {quiz ? (
        <Quiz items={quiz} onFinish={(r, t) => done(`${r}/${t} right. Each mistake is cleared after 2 correct answers in a row.`)} />
      ) : mcq ? (
        <McqRunner items={mcq} mode="practice" onFinish={(a) => done(`${a.filter((x) => x.correct).length}/${a.length} right.`)} />
      ) : (
        <>
          <p className="muted small" style={{ margin: "0 2px" }}>
            Every wrong answer lands here and keeps coming back until you get it right twice in a row.
          </p>
          {msg && <div className="notice"><Icon name="check" size={18} /><span>{msg}</span></div>}
          <div className="grid-2">
            <button className="hub-tile" data-skill="grammar" onClick={drillWords} disabled={!words.length} style={{ textAlign: "left" }}>
              <span className="count tag skill num">{words.length}</span>
              <b>Grammar & verbs</b><small>{words.length ? "Redo them now" : "Nothing to fix"}</small>
            </button>
            <button className="hub-tile" data-skill="exam" onClick={drillTcf} disabled={!tcf.length} style={{ textAlign: "left" }}>
              <span className="count tag skill num">{tcf.length}</span>
              <b>Listening & reading</b><small>{tcf.length ? "Redo them now" : "Nothing to fix"}</small>
            </button>
          </div>
          {open.length === 0 ? (
            <section className="card"><p className="empty">No open mistakes. Wrong answers from drills and practice tests will appear here.</p></section>
          ) : (
            <section className="card flush">
              <ul className="tasks">
                {open.slice(0, 60).map((m) => (
                  <li key={m.key} className="task" style={{ alignItems: "flex-start" }}>
                    <span className="task-text">
                      <span className="task-title" lang="fr">{m.prompt}</span>
                      <span className="task-meta">
                        <span className="tag">{LABEL[m.source]}</span>
                        <span>You: <s lang="fr">{m.given}</s></span>
                        <span>· Right: <b lang="fr">{m.correct}</b></span>
                        {m.streak > 0 && <span className="tag good">1 of 2 ✓</span>}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
