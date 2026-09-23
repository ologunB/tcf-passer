import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { asFeedback, gradeSpeaking, hasApiKey } from "../lib/ai";
import { countWords, SPEAKING_TASKS, speakingPrompts, type SpeakingPrompt } from "../lib/content";
import { nclcFor, rubricTo20 } from "../lib/scoring";
import { rateForLevel, speak, stop as stopTts, ttsAvailable } from "../lib/tts";
import { fmtClock } from "../timer";
import { Icon } from "./Icon";
import { Ring } from "./Ring";
import { Feedback, Rubric, ScoreLine, SPEAKING_CRITERIA } from "./Rubric";
import "../pages/writing-speaking.css";

type Phase = "ready" | "prep" | "rec" | "saving" | "saved";

/* Minimal Web Speech API typing (not in lib.dom). */
interface SRResult { isFinal: boolean; 0: { transcript: string } }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SR {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SREvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
const SRClass = (): (new () => SR) | undefined => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const pickMime = () => {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/aac"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
};

function envProblem(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) return "Recording needs a secure connection. Open the app from its https:// address (or localhost).";
  if (!navigator.mediaDevices?.getUserMedia) return "This browser can't use the microphone. Try an up-to-date Chrome or Safari.";
  if (typeof MediaRecorder === "undefined") return "This browser can't record audio. Update it or try Chrome.";
  return null;
}
function micError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone found. Plug one in or use your phone.";
  if (name === "NotReadableError") return "The microphone is busy in another app. Close it and try again.";
  return `Couldn't start the microphone${e instanceof Error ? `: ${e.message}` : "."}`;
}

export function SpeakingTask({ prompt, context, today, examMode = false, onSaved, assess = true }: {
  prompt: SpeakingPrompt;
  context: "practice" | "check" | "mock";
  today: string;
  examMode?: boolean;
  onSaved?: (recordingId: number) => void;
  assess?: boolean;
}) {
  const cfg = SPEAKING_TASKS[prompt.task];
  const [phase, setPhase] = useState<Phase>("ready");
  const [err, setErr] = useState<string | null>(envProblem);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [prepEnd, setPrepEnd] = useState(0);
  const [recStart, setRecStart] = useState<number | null>(null);
  const [recAcc, setRecAcc] = useState(0);
  const [live, setLive] = useState({ final: "", interim: "" });
  const [asked, setAsked] = useState(0);
  const [asking, setAsking] = useState(false);
  const [srFailed, setSrFailed] = useState(() => !SRClass());

  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recog = useRef<SR | null>(null);
  const listening = useRef(false);
  const finalText = useRef("");
  const duration = useRef(0);
  const alive = useRef(true);

  const ticking = phase === "prep" || (phase === "rec" && recStart != null);
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [ticking]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      listening.current = false;
      recog.current?.abort();
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      stopTts();
    };
  }, []);

  const totalMs = cfg.speakSec * 1000;
  const elapsed = recAcc + (recStart != null ? now - recStart : 0);
  const left = totalMs - elapsed;
  const prepLeft = prepEnd - now;

  const startRecognition = () => {
    const C = SRClass();
    if (!C || srFailed) return;
    const r = new C();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript.trim() + " ";
        else interim += res[0].transcript;
      }
      setLive({ final: finalText.current, interim });
    };
    r.onerror = (e) => {
      if (["not-allowed", "service-not-allowed", "language-not-supported", "network"].includes(e.error)) {
        listening.current = false;
        setSrFailed(true);
      }
    };
    r.onend = () => {
      setLive((l) => ({ ...l, interim: "" }));
      if (listening.current) {
        try { r.start(); } catch { /* already restarting */ }
      }
    };
    listening.current = true;
    recog.current = r;
    try { r.start(); } catch { setSrFailed(true); }
  };
  const stopRecognition = () => {
    listening.current = false;
    recog.current?.stop();
  };

  const save = async (mime: string) => {
    stream.current?.getTracks().forEach((t) => t.stop());
    if (!alive.current) return;
    const blob = new Blob(chunks.current, { type: mime });
    const id = (await db.recordings.add({
      date: today, task: prompt.task, promptId: prompt.id, blob, mime, durationSec: duration.current,
      transcript: finalText.current.trim(), context,
    })) as number;
    setSavedId(id);
    setPhase("saved");
    onSaved?.(id);
  };

  const startRec = () => {
    const s = stream.current;
    if (!s) return;
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    } catch {
      rec = new MediaRecorder(s);
    }
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => void save(rec.mimeType || mime || "audio/webm");
    rec.start(1000);
    recorder.current = rec;
    startRecognition();
    const t = Date.now();
    setNow(t);
    setRecStart(t);
    setPhase("rec");
  };

  const finish = () => {
    const rec = recorder.current;
    if (!rec || rec.state === "inactive" || phase !== "rec") return;
    duration.current = Math.round(Math.min(totalMs, elapsed) / 1000);
    stopRecognition();
    stopTts();
    setRecStart(null);
    setPhase("saving");
    rec.stop();
  };

  const pause = () => {
    recorder.current?.pause();
    stopRecognition();
    setRecAcc(elapsed);
    setRecStart(null);
  };
  const resume = () => {
    recorder.current?.resume();
    startRecognition();
    const t = Date.now();
    setNow(t);
    setRecStart(t);
  };

  const begin = async () => {
    const problem = envProblem();
    if (problem) return setErr(problem);
    setErr(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      return setErr(micError(e));
    }
    if (cfg.prepSec) {
      const t = Date.now();
      setNow(t);
      setPrepEnd(t + cfg.prepSec * 1000);
      setPhase("prep");
    } else startRec();
  };

  useEffect(() => {
    if (phase === "prep" && prepLeft <= 0) startRec();
  }, [phase, prepLeft <= 0]);
  useEffect(() => {
    if (phase === "rec" && recStart != null && left <= 0) finish();
  }, [phase, recStart, left <= 0]);

  const questions = prompt.questions ?? [];
  const askNext = async () => {
    const q = questions[asked];
    if (!q) return;
    setAsking(true);
    await speak(q, { rate: rateForLevel(prompt.level) });
    setAsking(false);
    setAsked((a) => a + 1);
  };

  if (phase === "saved" && savedId != null) {
    return assess ? (
      <SpeakingAssessment id={savedId} prompt={prompt} today={today} />
    ) : (
      <div className="notice"><Icon name="check" size={18} /><span>Task {prompt.task} recorded · {fmtClock(duration.current * 1000)}.</span></div>
    );
  }

  const paused = phase === "rec" && recStart == null;
  const ringValue = phase === "prep" ? prepLeft / (cfg.prepSec * 1000) : phase === "ready" ? 1 : left / totalMs;
  const shown = phase === "prep" ? prepLeft : phase === "ready" ? (cfg.prepSec ? cfg.prepSec * 1000 : totalMs) : left;
  const label = phase === "prep" ? "Prepare" : phase === "ready" ? (cfg.prepSec ? "Prep time" : "Speaking time") : paused ? "Paused" : phase === "saving" ? "Saving…" : "Speaking";
  const showIdeas = prompt.task === 2 && questions.length > 0;

  return (
    <div className="ws-task" data-skill="speaking">
      <section className="focus ws-prompt" data-skill="speaking">
        <div className="focus-label"><Icon name="speaking" size={14} /> {cfg.label}</div>
        <div className="ws-prompt-title">{prompt.title}</div>
        <p className="ws-fr" lang="fr">{prompt.instructions}</p>
        <div className="focus-meta">
          {cfg.prepSec > 0 && <span className="tag">{fmtClock(cfg.prepSec * 1000)} prep</span>}
          <span className="tag skill">{fmtClock(totalMs)} speaking</span>
          <span className="tag">{prompt.level}</span>
        </div>
        {showIdeas && (examMode ? (
          <details className="ws-ideas">
            <summary className="small">Question ideas (not given in the real exam)</summary>
            <ul lang="fr">{questions.map((q) => <li key={q}>{q}</li>)}</ul>
          </details>
        ) : (
          <div className="ws-ideas">
            <div className="small muted">You ask the examiner. Ideas:</div>
            <ul lang="fr">{questions.map((q) => <li key={q}>{q}</li>)}</ul>
          </div>
        ))}
      </section>

      {err && <div className="notice bad"><Icon name="alert" size={18} /><span>{err}</span></div>}

      <div className="card ws-stage">
        <Ring value={ringValue} size={200} stroke={12} color="var(--c)" track="var(--surface-2)">
          <b className="ws-ring-time num">{fmtClock(Math.max(0, shown))}</b>
          <span className="ws-ring-label">
            {phase === "rec" && !paused && <span className="running-dot" />} {label}
          </span>
        </Ring>

        {phase === "ready" && (
          <>
            <p className="muted small ws-center ws-tight">
              {cfg.prepSec
                ? `You get ${fmtClock(cfg.prepSec * 1000)} to prepare, then recording starts by itself for ${fmtClock(totalMs)}.`
                : `Recording starts straight away and stops by itself after ${fmtClock(totalMs)}.`}
              {prompt.task === 1 && " Tap “Play examiner question” to hear each question."}
            </p>
            <button className="btn primary lg block" onClick={begin} disabled={!!envProblem()}>
              <Icon name="play" size={16} /> {cfg.prepSec ? "Start preparation" : "Start recording"}
            </button>
          </>
        )}
        {phase === "prep" && (
          <button className="btn soft block" onClick={startRec}>I'm ready: start speaking now</button>
        )}
        {phase === "rec" && (
          <>
            {prompt.task === 1 && questions.length > 0 && (
              <button className="btn dark lg block" onClick={askNext} disabled={asking || asked >= questions.length || paused || !ttsAvailable()}>
                <Icon name="speaking" size={16} />
                {asking ? "Examiner speaking…" : asked >= questions.length ? "No more questions: keep talking" : `Play examiner question ${asked + 1}/${questions.length}`}
              </button>
            )}
            <div className="ws-actions">
              {!examMode && (paused ? (
                <button className="btn soft" onClick={resume}><Icon name="play" size={16} /> Resume</button>
              ) : (
                <button className="btn soft" onClick={pause}><Icon name="pause" size={16} /> Pause</button>
              ))}
              <button className={`btn ${examMode ? "ghost" : "primary"}`} onClick={finish}>
                <Icon name="check" size={16} stroke={2.6} /> {examMode ? "End task early" : "Stop & save"}
              </button>
            </div>
          </>
        )}
      </div>

      {prompt.task === 1 && asked > 0 && !examMode && (
        <ol className="ws-asked small" lang="fr">{questions.slice(0, asked).map((q) => <li key={q}>{q}</li>)}</ol>
      )}

      {(phase === "rec" || phase === "saving") && (
        srFailed ? (
          <p className="muted small ws-tight">Live transcript isn't available in this browser. After recording you can type roughly what you said (optional, needed for AI feedback).</p>
        ) : (
          <div className="card ws-live" aria-live="polite">
            <div className="eyebrow">Live transcript</div>
            <p lang="fr">{live.final}<span className="muted">{live.interim}</span>{!live.final && !live.interim && <span className="muted">Listening…</span>}</p>
          </div>
        )
      )}
    </div>
  );
}

/** Playback, transcript, self-assessment and AI feedback for a saved recording. */
export function SpeakingAssessment({ id, prompt, today }: { id: number; prompt?: SpeakingPrompt; today: string }) {
  const r = useLiveQuery(() => db.recordings.get(id), [id]);
  const keySet = useLiveQuery(() => hasApiKey(), []);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let u: string | null = null;
    let live = true;
    db.recordings.get(id).then((rec) => {
      if (!live || !rec?.blob) return;
      u = URL.createObjectURL(rec.blob);
      setUrl(u);
    });
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);

  if (!r) return null;
  const p = prompt ?? speakingPrompts.find((x) => x.id === r.promptId);
  const transcript = text ?? r.transcript ?? "";
  const fb = asFeedback(r.ai);
  const saveText = () => { if (text != null && text !== r.transcript) void db.recordings.update(id, { transcript: text }); };

  const onRubric = (v: Record<string, string>) => {
    const complete = SPEAKING_CRITERIA.every((c) => v[c.key]);
    return db.recordings.update(id, { rubric: v, selfScore: complete ? rubricTo20(SPEAKING_CRITERIA.map((c) => v[c.key])) : undefined });
  };
  const grade = async () => {
    if (!p) return;
    saveText();
    setBusy(true);
    setErr("");
    try {
      const f = await gradeSpeaking(p, transcript, r.durationSec);
      await db.recordings.update(id, { aiScore: f.score20, ai: f });
      if (r.context === "practice") await db.estimates.add({ skill: "speaking", source: "graded", score: f.score20, nclc: nclcFor("speaking", f.score20), date: today });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "AI grading failed.");
    } finally {
      setBusy(false);
    }
  };

  const short = r.durationSec < SPEAKING_TASKS[r.task].speakSec * 0.6;
  return (
    <div className="ws-assess" data-skill="speaking">
      <div className="card">
        <h3>Listen back</h3>
        {url ? <audio className="ws-audio" controls src={url} preload="metadata" /> : <p className="muted small">No audio saved for this recording.</p>}
        <p className="muted tiny ws-tight">
          {fmtClock(r.durationSec * 1000)} of {fmtClock(SPEAKING_TASKS[r.task].speakSec * 1000)}
          {short && " · you stopped well before the time; in the exam, keep talking until the examiner stops you."}
        </p>
      </div>

      <label className="field">
        {transcript ? "Transcript (fix any mistakes the recogniser made)" : "Type roughly what you said (optional, needed for AI feedback)"}
        <textarea lang="fr" spellCheck={false} autoCapitalize="sentences" value={transcript} onChange={(e) => setText(e.target.value)} onBlur={saveText} rows={5} placeholder="Je m'appelle…" />
        <span className="tiny">{countWords(transcript)} words</span>
      </label>

      <div className="card">
        <h3>Rate yourself</h3>
        <p className="muted small ws-tight">Listen to the recording first, then pick the level for each line.</p>
        <Rubric criteria={SPEAKING_CRITERIA} value={r.rubric ?? {}} onChange={onRubric} />
        {r.selfScore != null && <ScoreLine score={r.selfScore} skill="speaking" label="Your estimate" />}
      </div>

      <div className="card ws-ai">
        {fb ? <Feedback fb={fb} skill="speaking" /> : <h3><Icon name="sparkle" size={16} /> AI examiner</h3>}
        <p className="muted small ws-tight">
          {keySet
            ? "The AI reads the transcript only. It can't hear you, so it can't judge your pronunciation or accent: use your own ear (or a teacher) for that."
            : <>Add a free Gemini key (or a Claude key) in <a href="#/settings">Settings</a> to get feedback on what you said. (It reads the transcript only, so it can't judge pronunciation.)</>}
        </p>
        {err && <div className="notice bad"><Icon name="alert" size={18} /><span>{err}</span></div>}
        {keySet && p && (
          <button className={`btn ${fb ? "soft" : "primary"} block`} onClick={grade} disabled={busy || !transcript.trim()}>
            {busy ? <><span className="ws-spin" aria-hidden="true" /> Grading…</> : <><Icon name="sparkle" size={16} /> {fb ? "Grade again" : "Get AI feedback"}</>}
          </button>
        )}
      </div>
    </div>
  );
}
