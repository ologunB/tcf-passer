import { useState } from "react";
import { Icon } from "../components/Icon";
import { Quiz, type QuizItem } from "../components/Quiz";
import { grammarItems } from "../lib/content";
import { logStudy } from "../lib/logStudy";
import { findWeek, plan } from "../lib/plan";
import { buildSession } from "../lib/quizItems";

type Mode = "week" | "review" | "verbs";

export function GrammarPage({ today }: { today: string }) {
  const week = findWeek(plan, today) ?? plan.weeks[0];
  const w = today < plan.start ? 1 : week.week;
  const [items, setItems] = useState<QuizItem[] | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [done, setDone] = useState<{ right: number; total: number; logged: string } | null>(null);

  const start = (mode: Mode) => {
    setItems(buildSession(w, mode));
    setStartedAt(Date.now());
    setDone(null);
  };
  const finish = async (right: number, total: number) => {
    const min = (Date.now() - startedAt) / 60_000;
    const how = await logStudy(today, "grammar", "grammar", min, `Grammar drill: ${right}/${total}`);
    setDone({ right, total, logged: how === "task" ? "Ticked off today's grammar task." : "Logged as extra study." });
    setItems(null);
  };

  const topics = [...new Set(grammarItems.filter((g) => g.week <= w).map((g) => g.topic))];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><a href="#/study">Study</a> · Week {w}</div>
          <h1 className="title">Grammaire<em>.</em></h1>
        </div>
        {items && <button className="btn ghost" onClick={() => setItems(null)}>Quit</button>}
      </header>

      {items ? (
        <Quiz items={items} onFinish={finish} />
      ) : (
        <>
          {done && (
            <section className="card celebrate">
              <div className="big num">{done.right} / {done.total}</div>
              <div className="muted">{done.right === done.total ? "Parfait !" : "Wrong answers are in your mistake bank. They come back until you get them right twice."}</div>
              <div className="tiny muted" style={{ marginTop: 6 }}>{done.logged}</div>
            </section>
          )}
          <section className="focus" data-skill="grammar">
            <div className="focus-label">This week</div>
            <div className="focus-title">{week.focus.grammar}</div>
            <div className="focus-meta">About 12 questions: this week's topic, a little review and verb drills. Explanations after every answer.</div>
            <div className="focus-actions"><button className="btn primary lg" style={{ flex: 1 }} onClick={() => start("week")}><Icon name="play" size={16} /> Start drill</button></div>
          </section>
          <div className="grid-2">
            <button className="hub-tile" onClick={() => start("review")} style={{ textAlign: "left" }}>
              <b>Mixed review</b><small>Everything from weeks 1–{w}</small>
            </button>
            <button className="hub-tile" onClick={() => start("verbs")} style={{ textAlign: "left" }}>
              <b>Verb drills</b><small>Type the conjugation. Accents count.</small>
            </button>
          </div>
          <div className="section-title"><h2>Covered so far</h2><span>{topics.length} topics</span></div>
          <section className="card">
            <div className="task-meta" style={{ gap: 6 }}>{topics.map((t) => <span key={t} className="tag">{t}</span>)}</div>
            <p className="muted tiny" style={{ margin: "10px 0 0" }}>
              For explanations, see this week's resources: Kwiziq and Lawless French (links on your Today tasks).
            </p>
          </section>
        </>
      )}
    </div>
  );
}
