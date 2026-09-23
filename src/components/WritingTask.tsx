import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { asFeedback, gradeWriting, hasApiKey } from "../lib/ai";
import { countWords, WRITING_TASKS, writingPrompts, type WritingPrompt } from "../lib/content";
import { nclcFor, rubricTo20 } from "../lib/scoring";
import { fmtClock } from "../timer";
import { Icon } from "./Icon";
import { Feedback, Rubric, ScoreLine, WRITING_CRITERIA } from "./Rubric";
import "../pages/writing-speaking.css";

type Ctx = "practice" | "check" | "mock";

const draftKey = (p: WritingPrompt, ctx: Ctx) => `tcf-draft:${ctx}:${p.id}`;
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } },
  set: (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

/** Milliseconds left until `end` (ticks twice a second; null = stopped). */
export function useCountdown(end: number | null | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (end == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [end]);
  return end == null ? Infinity : end - now;
}

export function rangeState(task: 1 | 2 | 3, words: number): "low" | "ok" | "high" {
  const r = WRITING_TASKS[task];
  return words < r.min ? "low" : words > r.max ? "high" : "ok";
}

export function WordCount({ task, words }: { task: 1 | 2 | 3; words: number }) {
  const r = WRITING_TASKS[task];
  const st = rangeState(task, words);
  return (
    <span className="ws-count" data-state={st} aria-live="polite">
      <b className="num">{words}</b> words
      <span className="ws-count-rule">
        {st === "low" ? `· ${r.min - words} to go (min ${r.min})` : st === "high" ? `· ${words - r.max} over the max (${r.max})` : `· in range ${r.min}–${r.max}`}
      </span>
    </span>
  );
}

export function PromptCard({ prompt }: { prompt: WritingPrompt }) {
  const r = WRITING_TASKS[prompt.task];
  return (
    <section className="focus ws-prompt" data-skill="writing">
      <div className="focus-label"><Icon name="writing" size={14} /> {r.label}</div>
      <div className="ws-prompt-title">{prompt.title}</div>
      <p className="ws-fr" lang="fr">{prompt.instructions}</p>
      {prompt.docs?.map((d, i) => (
        <blockquote key={i} className="ws-doc" lang="fr">{d}</blockquote>
      ))}
      <div className="focus-meta">
        <span className="tag skill">{r.min}–{r.max} words</span>
        <span className="tag">{prompt.level}</span>
        {prompt.task === 3 && <span className="small">Sum up both documents, then give your opinion.</span>}
      </div>
    </section>
  );
}

export function WritingTask({ prompt, context, today, deadline, showTimer = true, onSaved, assess = true }: {
  prompt: WritingPrompt;
  context: Ctx;
  today: string;
  deadline?: number;
  showTimer?: boolean;
  onSaved?: (writingId: number) => void;
  assess?: boolean;
}) {
  const rule = WRITING_TASKS[prompt.task];
  const key = draftKey(prompt, context);
  const [text, setText] = useState(() => ls.get(key));
  const [savedId, setSavedId] = useState<number | null>(null);
  const [practiceEnd] = useState(() => Date.now() + rule.suggestMin * 60_000);
  const started = useRef(Date.now());
  const textRef = useRef(text);
  const saving = useRef(false);
  const left = useCountdown(savedId == null ? (deadline ?? practiceEnd) : null);
  const words = countWords(text);
  const st = rangeState(prompt.task, words);
  textRef.current = text;

  useEffect(() => {
    if (savedId == null) ls.set(key, text);
  }, [key, text, savedId]);

  const submit = async () => {
    if (saving.current) return;
    saving.current = true;
    const t = textRef.current;
    const id = await db.writings.add({
      date: today, task: prompt.task, promptId: prompt.id, text: t, words: countWords(t), context,
      durationSec: Math.round((Date.now() - started.current) / 1000),
    });
    ls.set(key, "");
    setSavedId(id as number);
    onSaved?.(id as number);
  };

  useEffect(() => {
    if (deadline != null && savedId == null && left <= 0) void submit();
  }, [deadline, left <= 0, savedId]);

  if (savedId != null) {
    return (
      <div className="ws-task">
        {assess ? (
          <WritingAssessment id={savedId} prompt={prompt} today={today} />
        ) : (
          <div className="notice"><Icon name="check" size={18} /><span>Task {prompt.task} handed in · {words} words.</span></div>
        )}
      </div>
    );
  }

  const timeUp = left <= 0;
  return (
    <div className="ws-task" data-skill="writing">
      <PromptCard prompt={prompt} />
      <div className="ws-bar">
        <WordCount task={prompt.task} words={words} />
        {showTimer && (
          <span className={`ws-clock num${timeUp ? " up" : left < 120_000 ? " low" : ""}`} aria-label="Time left">
            <Icon name="clock" size={14} /> {timeUp ? "Time's up" : fmtClock(left)}
          </span>
        )}
      </div>
      <label className="sr-only" htmlFor={`ws-text-${prompt.id}`}>Your answer in French</label>
      <textarea
        id={`ws-text-${prompt.id}`}
        className="ws-text"
        lang="fr"
        spellCheck={false}
        autoCapitalize="sentences"
        autoCorrect="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Écrivez votre réponse ici…"
      />
      {showTimer && timeUp && deadline == null && (
        <div className="notice warn"><Icon name="hourglass" size={18} /><span>Suggested time ({rule.suggestMin} min) is up. In the exam you'd need to move on now: finish your sentence and submit.</span></div>
      )}
      {st !== "ok" && words > 0 && (
        <div className={`notice ${st === "high" || timeUp ? "bad" : "warn"}`}>
          <Icon name="alert" size={18} />
          <span>
            {st === "low" ? <>Too short: the exam needs <b>at least {rule.min} words</b>.</> : <>Too long: the exam allows <b>at most {rule.max} words</b>. Cut {words - rule.max}.</>}{" "}
            Out-of-range answers can be marked <b>“A1 non atteint”</b>, which scores almost nothing.
          </span>
        </div>
      )}
      {context !== "mock" && (
        <button className={`btn ${st === "ok" ? "primary" : "dark"} lg block`} onClick={submit} disabled={!words}>
          <Icon name="check" size={18} stroke={2.6} /> {st === "ok" ? "Submit" : "Submit anyway"}
        </button>
      )}
      <p className="muted tiny ws-center">Your draft is kept on this device until you submit.</p>
    </div>
  );
}

/** Self-assessment + AI grading for a saved writing. Used after submitting and in history. */
export function WritingAssessment({ id, prompt, today, showText = true }: { id: number; prompt?: WritingPrompt; today: string; showText?: boolean }) {
  const w = useLiveQuery(() => db.writings.get(id), [id]);
  const keySet = useLiveQuery(() => hasApiKey(), []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!w) return null;
  const p = prompt ?? writingPrompts.find((x) => x.id === w.promptId);
  const fb = asFeedback(w.ai);
  const rubric = w.rubric ?? {};
  const st = rangeState(w.task, w.words);

  const onRubric = (v: Record<string, string>) => {
    const complete = WRITING_CRITERIA.every((c) => v[c.key]);
    return db.writings.update(id, { rubric: v, selfScore: complete ? rubricTo20(WRITING_CRITERIA.map((c) => v[c.key])) : undefined });
  };
  const grade = async () => {
    if (!p) return;
    setBusy(true);
    setErr("");
    try {
      const f = await gradeWriting(p, w.text);
      await db.writings.update(id, { aiScore: f.score20, ai: f });
      if (w.context === "practice") await db.estimates.add({ skill: "writing", source: "graded", score: f.score20, nclc: nclcFor("writing", f.score20), date: today });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "AI grading failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ws-assess" data-skill="writing">
      {showText && (
        <details className="card ws-answer" open={!fb}>
          <summary>
            <b>Your answer</b> <span className={`tag ${st === "ok" ? "good" : "bad"}`}>{w.words} words{st !== "ok" && " · out of range"}</span>
          </summary>
          {p && <p className="ws-fr small muted" lang="fr">{p.instructions}</p>}
          <div className="ws-corrected" lang="fr">{w.text || <span className="muted">(blank)</span>}</div>
        </details>
      )}

      {st !== "ok" && (
        <div className="notice bad"><Icon name="alert" size={18} /><span>{w.words} words is outside the {WRITING_TASKS[w.task].min}–{WRITING_TASKS[w.task].max} range. In the real exam this could be marked “A1 non atteint”.</span></div>
      )}

      <div className="card">
        <h3>Rate yourself</h3>
        <p className="muted small ws-tight">Be honest: compare with the descriptions, not with how hard you tried.</p>
        <Rubric criteria={WRITING_CRITERIA} value={rubric} onChange={onRubric} />
        {w.selfScore != null && <ScoreLine score={w.selfScore} skill="writing" label="Your estimate" />}
      </div>

      <div className="card ws-ai">
        {fb ? (
          <Feedback fb={fb} skill="writing" />
        ) : (
          <>
            <h3><Icon name="sparkle" size={16} /> AI examiner</h3>
            {keySet ? (
              <p className="muted small ws-tight">Claude grades your text like a strict TCF examiner and rewrites it correctly. Needs internet; takes up to a minute.</p>
            ) : (
              <p className="muted small ws-tight">Add your Anthropic API key in <a href="#/settings">Settings</a> to get a strict examiner grade and a corrected version.</p>
            )}
          </>
        )}
        {err && <div className="notice bad"><Icon name="alert" size={18} /><span>{err}</span></div>}
        {keySet && p && (
          <button className={`btn ${fb ? "soft" : "primary"} block`} onClick={grade} disabled={busy || !w.text.trim()}>
            {busy ? <><span className="ws-spin" aria-hidden="true" /> Grading…</> : <><Icon name="sparkle" size={16} /> {fb ? "Grade again" : "Grade with AI"}</>}
          </button>
        )}
      </div>
    </div>
  );
}
