import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { db, setSetting, type CardState } from "../db";
import { useSetting } from "../hooks";
import { cardById, decks, type Flashcard } from "../lib/content";
import { logStudy } from "../lib/logStudy";
import { findWeek, plan } from "../lib/plan";
import { newState, nextNewCards, previews, Rating, review, type Grade } from "../lib/srs";
import { speak, stop } from "../lib/tts";

export function FlashcardsPage({ today }: { today: string }) {
  const states = useLiveQuery(() => db.cards.toArray(), []);
  const perDay = useSetting<number>("newPerDay", 20);
  const autoSpeak = useSetting<boolean>("autoSpeak", true);
  const [now, setNow] = useState(Date.now());
  const [revealed, setRevealed] = useState(false);
  const [session, setSession] = useState<{ start: number; reviewed: number } | null>(null);
  const [browse, setBrowse] = useState<string | null>(null);
  const [logged, setLogged] = useState("");
  const dir = useSetting<"fr-en" | "en-fr">("cardDir", "fr-en");
  const rev = dir === "en-fr";
  const week = today < plan.start ? 1 : (findWeek(plan, today)?.week ?? 1);

  // Learning steps are minutes long, so re-check what's due every 15 s.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // Reverse (EN → FR) cards have their own schedule under `${id}#r`, and only unlock once the word
  // has been reviewed at least twice French → English.
  const q = useMemo(() => {
    if (!states) return null;
    const mine = states.filter((s) => s.id.endsWith("#r") === rev);
    const started = new Set(mine.map((s) => s.id.replace(/#r$/, "")));
    const newToday = mine.filter((s) => s.introducedOn === today).length;
    const due = mine.filter((s) => s.due <= now).sort((a, b) => a.due - b.due);
    const limit = Math.max(0, (rev ? Math.ceil(perDay / 2) : perDay) - newToday);
    const fresh = rev
      ? states
          .filter((s) => !s.id.endsWith("#r") && Number((s.fsrs as { reps?: number }).reps ?? 0) >= 2 && !started.has(s.id))
          .slice(0, limit)
          .map((s) => cardById.get(s.id)!)
          .filter(Boolean)
      : nextNewCards(started, week, limit);
    const later = mine.filter((s) => s.due > now).sort((a, b) => a.due - b.due)[0];
    const reversible = states.filter((s) => !s.id.endsWith("#r") && Number((s.fsrs as { reps?: number }).reps ?? 0) >= 2).length;
    return { due, fresh, newToday, later, learned: states.filter((s) => !s.id.endsWith("#r")).length, reversible };
  }, [states, now, today, week, perDay, rev]);

  const current: { card: Flashcard; state?: CardState } | null = q
    ? q.due[0]
      ? { card: cardById.get(q.due[0].id.replace(/#r$/, ""))!, state: q.due[0] }
      : q.fresh[0]
        ? { card: q.fresh[0] }
        : null
    : null;

  useEffect(() => {
    setRevealed(false);
    if (current && session && autoSpeak && !rev) speak(current.card.fr, { rate: 0.85 });
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.card.id, !!session]);

  if (!q) return null;
  const fresh = (c: Flashcard) => (rev ? { ...newState(c, today), id: `${c.id}#r` } : newState(c, today));
  const pv = current ? previews(current.state ?? fresh(current.card)) : null;

  const grade = async (g: Grade) => {
    if (!current) return;
    const base = current.state ?? fresh(current.card);
    await db.cards.put(review(base, g));
    setSession((s) => s && { ...s, reviewed: s.reviewed + 1 });
    setNow(Date.now());
  };

  const endSession = async () => {
    if (session && session.reviewed > 0) {
      const how = await logStudy(today, "srs", "vocabulary", (Date.now() - session.start) / 60_000, `Flashcards: ${session.reviewed} reviews`);
      setLogged(how === "task" ? "Ticked off today's flashcards task." : "Logged as extra study.");
    }
    setSession(null);
  };

  const deck = decks.find((d) => d.id === browse);
  const learnedIn = (id: string) => (states ?? []).filter((s) => s.deck === id && !s.id.endsWith("#r")).length;

  if (session) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <div className="eyebrow num">{q.due.length} due · {q.fresh.length} new left today</div>
            <h1 className="title">Cartes<em>.</em></h1>
          </div>
          <button className="btn soft" onClick={endSession}>Done</button>
        </header>
        {current ? (
          <>
            <div className="flash" onClick={() => { if (!revealed && rev) speak(current.card.fr, { rate: 0.85 }); setRevealed(true); }}>
              <button className="icon-btn speak" onClick={(e) => { e.stopPropagation(); speak(current.card.fr, { rate: 0.85 }); }} aria-label="Hear it">
                <Icon name="listening" size={18} />
              </button>
              {!current.state && <span className="tag brand" style={{ justifySelf: "center" }}>New</span>}
              {rev ? (
                <div className="flash-fr">{current.card.en}</div>
              ) : (
                <div className="flash-fr" lang="fr">{current.card.fr}</div>
              )}
              {revealed ? (
                <>
                  {rev ? <div className="flash-en" lang="fr">{current.card.fr}</div> : <div className="flash-en">{current.card.en}</div>}
                  {current.card.ex && (
                    <button className="flash-ex" style={{ all: "unset", cursor: "pointer" }} lang="fr" onClick={(e) => { e.stopPropagation(); speak(current.card.ex!, { rate: 0.9 }); }}>
                      « {current.card.ex} » <Icon name="listening" size={13} />
                    </button>
                  )}
                </>
              ) : (
                <div className="muted small">{rev ? "Say it in French out loud, then tap to check" : "Say what it means, then tap to check"}</div>
              )}
            </div>
            {revealed ? (
              <div className="grades">
                <button className="again" onClick={() => grade(Rating.Again)}>Again<small>{pv![Rating.Again]}</small></button>
                <button className="hard" onClick={() => grade(Rating.Hard)}>Hard<small>{pv![Rating.Hard]}</small></button>
                <button className="good" onClick={() => grade(Rating.Good)}>Good<small>{pv![Rating.Good]}</small></button>
                <button className="easy" onClick={() => grade(Rating.Easy)}>Easy<small>{pv![Rating.Easy]}</small></button>
              </div>
            ) : (
              <button className="btn dark lg block" onClick={() => { if (rev) speak(current.card.fr, { rate: 0.85 }); setRevealed(true); }}>Show answer</button>
            )}
            <p className="muted tiny" style={{ textAlign: "center", margin: 0 }}>
              Again if you didn't know it · Good if you did · Easy if it was instant
            </p>
          </>
        ) : (
          <section className="card celebrate">
            <Icon name="sparkle" size={30} />
            <div className="big">C'est fini pour l'instant !</div>
            <div className="muted">
              {q.later ? `Next card is due ${new Date(q.later.due).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}.` : "No cards waiting."}
            </div>
            <button className="btn primary" style={{ marginTop: 12 }} onClick={endSession}>Finish & log time</button>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><a href="#/study">Study</a> · {q.learned} words started</div>
          <h1 className="title">Cartes<em>.</em></h1>
        </div>
      </header>
      {logged && <div className="notice"><Icon name="check" size={18} /><span>{logged}</span></div>}
      <div className="seg" role="group" aria-label="Direction">
        <button aria-pressed={!rev} onClick={() => setSetting("cardDir", "fr-en")}>French → English</button>
        <button aria-pressed={rev} onClick={() => setSetting("cardDir", "en-fr")}>English → French</button>
      </div>
      {rev && (
        <p className="muted tiny" style={{ margin: "-4px 4px 0" }}>
          Production practice: you see English and say the French. Words join here after 2 reviews the other way ({q.reversible} ready). This is what makes vocabulary usable in writing and speaking.
        </p>
      )}
      <section className="focus" data-skill="vocabulary">
        <div className="focus-label">Today · {rev ? "English → French" : "French → English"}</div>
        <div className="focus-title num">{q.due.length} to review · {q.fresh.length} new</div>
        <div className="focus-meta">
          Spaced repetition (FSRS): each word comes back just before you'd forget it. New today: {q.newToday}/{perDay}.
        </div>
        <div className="focus-actions">
          <button className="btn primary lg" style={{ flex: 1 }} disabled={!q.due.length && !q.fresh.length} onClick={() => { setLogged(""); setSession({ start: Date.now(), reviewed: 0 }); }}>
            <Icon name="play" size={16} /> {q.due.length || q.fresh.length ? "Start" : "All done for now"}
          </button>
        </div>
      </section>

      <div className="section-title"><h2>Decks</h2><span>unlock by plan week</span></div>
      <section className="card flush">
        <ul className="tasks">
          {decks.map((d) => {
            const n = learnedIn(d.id);
            const locked = d.week > week;
            return (
              <li key={d.id} className="task" data-skill="vocabulary">
                <button className="task-body" onClick={() => setBrowse(d.id)}>
                  <span className="skill-badge" style={{ width: 40, height: 40, fontWeight: 700 }}>W{d.week}</span>
                  <span className="task-text">
                    <span className="task-title">{d.title.split(":")[0]}</span>
                    <span className="task-meta">
                      <span className="num">{n}/{d.cards.length} started</span>
                      {locked && <span className="tag">unlocks week {d.week}</span>}
                    </span>
                  </span>
                  <Icon name="chevronR" size={18} className="muted" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <Sheet open={!!deck} onClose={() => setBrowse(null)} title={deck?.title}>
        {deck && (
          <ul className="tasks" style={{ margin: "0 -14px" }}>
            {deck.cards.map(([fr, en, ex]) => (
              <li key={fr} className="task">
                <button className="icon-btn" onClick={() => speak(fr, { rate: 0.85 })} aria-label={`Hear ${fr}`}><Icon name="listening" size={16} /></button>
                <span className="task-text">
                  <span className="task-title" lang="fr">{fr}</span>
                  <span className="task-meta"><span>{en}</span>{ex && <span lang="fr">· « {ex} »</span>}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
