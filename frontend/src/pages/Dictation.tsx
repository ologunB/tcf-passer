import { useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { dictationPool } from "../lib/content";
import { compareDictation, dictationScore, type Mark } from "../lib/diff";
import { logStudy } from "../lib/logStudy";
import { findWeek, plan } from "../lib/plan";
import { speak, stop } from "../lib/tts";

const ACCENTS = ["é", "è", "ê", "à", "â", "ç", "î", "ô", "û", "ù", "ë", "œ"];
const pickN = <T,>(a: T[], n: number) => [...a].sort(() => Math.random() - 0.5).slice(0, n);

export function DictationPage({ today }: { today: string }) {
  const week = today < plan.start ? 1 : (findWeek(plan, today)?.week ?? 1);
  const pool = useMemo(() => dictationPool(week), [week]);
  const [items, setItems] = useState<ReturnType<typeof dictationPool> | null>(null);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [marks, setMarks] = useState<{ word: string; mark: Mark; typed?: string }[] | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [slow, setSlow] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const item = items?.[i];
  const play = () => item && speak(item.fr, { rate: slow ? 0.65 : 0.85 });

  const start = () => {
    const picked = pickN(pool, 8);
    setItems(picked);
    setI(0);
    setScores([]);
    setTyped("");
    setMarks(null);
    setDone(null);
    setStartedAt(Date.now());
    speak(picked[0].fr, { rate: 0.85 }); // inside the tap, so phones allow the audio
  };

  const check = () => {
    if (!item || !typed.trim()) return;
    const m = compareDictation(item.fr, typed);
    setMarks(m);
    setScores((s) => [...s, dictationScore(m)]);
  };
  const next = async () => {
    stop();
    if (!items) return;
    if (i + 1 >= items.length) {
      const avg = [...scores].reduce((a, b) => a + b, 0) / scores.length;
      await logStudy(today, "dictation", "listening", (Date.now() - startedAt) / 60_000, `Dictation: ${Math.round(avg * 100)}%`);
      setDone(`${Math.round(avg * 100)}% of words right across ${items.length} sentences.`);
      setItems(null);
      return;
    }
    setI(i + 1);
    setTyped("");
    setMarks(null);
    speak(items[i + 1].fr, { rate: slow ? 0.65 : 0.85 });
    requestAnimationFrame(() => ref.current?.focus());
  };
  const insert = (ch: string) => {
    const el = ref.current;
    const s = el?.selectionStart ?? typed.length;
    const e = el?.selectionEnd ?? typed.length;
    setTyped(typed.slice(0, s) + ch + typed.slice(e));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + 1, s + 1);
    });
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><a href="#/study">Study</a> · listening + spelling</div>
          <h1 className="title">Dictée<em>.</em></h1>
        </div>
        {items && <button className="btn ghost" onClick={() => { stop(); setItems(null); }}>Quit</button>}
      </header>

      {!items ? (
        <>
          {done && <section className="card celebrate"><div className="big">Bravo !</div><div className="muted">{done}</div></section>}
          <section className="focus" data-skill="listening">
            <div className="focus-label">8 sentences · about 10 minutes</div>
            <div className="focus-title">Hear it, type it, see every mistake</div>
            <div className="focus-meta">
              Sentences come from your unlocked flashcard examples and listening scripts at your level. Dictation trains the two things TCF listening punishes: catching every word, and knowing how it's spelled.
            </div>
            <div className="focus-actions">
              <button className="btn primary lg" style={{ flex: 1 }} onClick={start} disabled={!pool.length}><Icon name="play" size={16} /> Start</button>
            </div>
          </section>
          <p className="muted tiny" style={{ margin: "0 4px" }}>{pool.length} sentences available at week {week}.</p>
        </>
      ) : item ? (
        <div className="mcq" data-skill="listening">
          <div className="mcq-top">
            <span className="small num">Sentence <b>{i + 1}</b> / {items.length}</span>
            <span className="tag skill">{item.level}</span>
          </div>
          <div className="mcq-progress" aria-hidden="true"><i style={{ width: `${(i / items.length) * 100}%` }} /></div>
          <div className="card mcq-audio">
            <button className="mcq-play" onClick={play} aria-label="Play the sentence"><Icon name="play" size={30} /></button>
            <div className="seg" style={{ width: "100%", maxWidth: 260 }}>
              <button aria-pressed={!slow} onClick={() => setSlow(false)}>Normal</button>
              <button aria-pressed={slow} onClick={() => setSlow(true)}>Slow</button>
            </div>
          </div>
          <textarea
            ref={ref}
            className="answer-input"
            lang="fr"
            autoCapitalize="sentences"
            autoCorrect="off"
            spellCheck={false}
            rows={3}
            value={typed}
            readOnly={!!marks}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type exactly what you hear…"
            aria-label="What you heard"
          />
          {!marks && (
            <div className="accents">
              {ACCENTS.map((a) => <button key={a} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(a)}>{a}</button>)}
            </div>
          )}
          {marks && (
            <div className="card" style={{ display: "grid", gap: 8 }}>
              <div className="dict" lang="fr">
                {marks.map((m, k) => (
                  <span key={k} className={`dict-w ${m.mark}`} title={m.typed ? `You typed: ${m.typed}` : m.mark === "missing" ? "Missing" : ""}>{m.word}</span>
                ))}
              </div>
              <div className="legend small">
                <span><i style={{ background: "var(--good)" }} /> right</span>
                <span><i style={{ background: "var(--warn)" }} /> accent</span>
                <span><i style={{ background: "var(--bad)" }} /> wrong / missing</span>
              </div>
            </div>
          )}
          {!marks ? (
            <button className="btn dark lg block" onClick={check} disabled={!typed.trim()}>Check</button>
          ) : (
            <button className="btn dark lg block" onClick={next}>{i + 1 === items.length ? "Finish" : "Next"} <Icon name="chevronR" size={18} /></button>
          )}
        </div>
      ) : null}
    </div>
  );
}
