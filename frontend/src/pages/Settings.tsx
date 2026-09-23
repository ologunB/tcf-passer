import { useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { exportAll, importAll, setSetting } from "../db";
import { useExamDate, useSetting } from "../hooks";
import { fmtDay } from "../lib/dates";
import { examEvent, plan } from "../lib/plan";
import { frenchVoices, speak, ttsAvailable } from "../lib/tts";

export type Theme = "system" | "light" | "dark";

export function SettingsPage({ today }: { today: string }) {
  const examDate = useExamDate();
  const theme = useSetting<Theme>("theme", "system");
  const lastExport = useSetting<string | null>("lastExport", null);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const anthropicKey = useSetting<string>("anthropicKey", "");
  const geminiKey = useSetting<string>("geminiKey", "");
  const chosen = useSetting<string>("aiProvider", "");
  const provider = chosen === "claude" || chosen === "gemini" ? chosen : geminiKey || !anthropicKey ? "gemini" : "claude";
  const keyName = provider === "gemini" ? "geminiKey" : "anthropicKey";
  const apiKey = provider === "gemini" ? geminiKey : anthropicKey;
  const perDay = useSetting<number>("newPerDay", 20);
  const autoSpeak = useSetting<boolean>("autoSpeak", true);
  const [keyDraft, setKeyDraft] = useState<string | null>(null);
  const [withAudio, setWithAudio] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    const data = await exportAll({ includeAudio: withAudio });
    const name = `tcf-passer-backup-${today}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const file = new File([blob], name, { type: "application/json" });
    // On phones the share sheet can save straight to Files, Google Drive or WhatsApp.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "TCF Passer backup" });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        download(blob, name);
      }
    } else download(blob, name);
    await setSetting("lastExport", new Date().toISOString());
    setMsg({ kind: "ok", text: `Backup saved: ${data.entries.length} log entries.` });
  };

  const doImport = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!confirm("Importing replaces everything currently in the app with this backup. Continue?")) return;
      const n = await importAll(data);
      setMsg({ kind: "ok", text: `Restored ${n} log entries.` });
    } catch (e) {
      setMsg({ kind: "bad", text: e instanceof SyntaxError ? "That file isn't valid JSON." : (e as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const fmt = (d: string) => fmtDay(d, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">TCF Passer</div>
          <h1 className="title">Réglages<em>.</em></h1>
        </div>
      </header>

      <div className="list-label">Exam</div>
      <div className="list">
        <label className="list-row">
          <span className="ico"><Icon name="calendar" size={17} /></span>
          <span className="txt">
            <b>Exam date</b>
            <span>Change this once AF Lagos confirms your booking. The plan targets week {plan.firstSittingWeek} ({fmt(examEvent(plan)?.date ?? plan.deadline)}).</span>
          </span>
        </label>
        <div style={{ padding: "0 16px 14px" }}>
          <input type="date" value={examDate} min={today} max={plan.deadline} onChange={(e) => e.target.value && setSetting("examDate", e.target.value)} aria-label="Exam date" />
          <p className="muted tiny" style={{ margin: "6px 2px 0" }}>Hard deadline: {fmt(plan.deadline)}</p>
        </div>
      </div>

      <div className="list-label">Your data</div>
      <div className="list">
        <button className="list-row" onClick={doExport}>
          <span className="ico"><Icon name="download" size={17} /></span>
          <span className="txt">
            <b>Export backup</b>
            <span>{lastExport ? `Last backup ${fmt(lastExport.slice(0, 10))}` : "No backup yet"}. Keep it in Google Drive or email it to yourself.</span>
          </span>
          <Icon name="chevronR" size={18} className="muted" />
        </button>
        <button className="list-row" onClick={() => fileRef.current?.click()}>
          <span className="ico"><Icon name="upload" size={17} /></span>
          <span className="txt">
            <b>Import backup</b>
            <span>Restore on a new phone or browser. This replaces what's here.</span>
          </span>
          <Icon name="chevronR" size={18} className="muted" />
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
      </div>
      {msg && (
        <div className={`notice ${msg.kind === "bad" ? "bad" : ""}`}>
          <Icon name={msg.kind === "bad" ? "alert" : "check"} size={18} />
          <span>{msg.text}</span>
        </div>
      )}

      <label className="row small" style={{ gap: 8, margin: "-4px 4px 0" }}>
        <input type="checkbox" checked={withAudio} onChange={(e) => setWithAudio(e.target.checked)} /> Include voice recordings in the backup (much bigger file)
      </label>

      <div className="list-label">Study</div>
      <div className="list">
        <div className="list-row">
          <span className="ico"><Icon name="vocabulary" size={17} /></span>
          <span className="txt"><b>New flashcards a day</b><span>The plan assumes 20. Lower it if reviews pile up.</span></span>
          <div className="stepper" style={{ gap: 6 }}>
            <button onClick={() => setSetting("newPerDay", Math.max(5, perDay - 5))} aria-label="Fewer new cards" style={{ width: 36, height: 36 }}>−</button>
            <output className="num" style={{ fontSize: "1.3rem", minWidth: 36 }}>{perDay}</output>
            <button onClick={() => setSetting("newPerDay", Math.min(50, perDay + 5))} aria-label="More new cards" style={{ width: 36, height: 36 }}>+</button>
          </div>
        </div>
        <label className="list-row">
          <span className="ico"><Icon name="listening" size={17} /></span>
          <span className="txt"><b>Say each flashcard aloud</b><span>Uses your phone's French voice</span></span>
          <input type="checkbox" checked={autoSpeak} onChange={(e) => setSetting("autoSpeak", e.target.checked)} />
        </label>
        <button className="list-row" onClick={() => speak("Bonjour ! Je m'appelle Claire. Bonne chance pour votre examen du TCF Canada.")}>
          <span className="ico"><Icon name="play" size={15} /></span>
          <span className="txt">
            <b>Test the French voice</b>
            <span>{!ttsAvailable() ? "This browser has no speech support." : frenchVoices().length ? `Using ${frenchVoices()[0].name}. For a better voice, add a French voice in your phone's accessibility settings (spoken content).` : "No French voice found. Add one in your phone's accessibility settings (spoken content), then reopen the app."}</span>
          </span>
        </button>
      </div>

      <div className="list-label">AI grading (optional)</div>
      <section className="card" style={{ display: "grid", gap: 12 }}>
        <div className="seg" role="group" aria-label="AI provider">
          <button aria-pressed={provider === "gemini"} onClick={() => { setSetting("aiProvider", "gemini"); setKeyDraft(null); }}>Gemini · free</button>
          <button aria-pressed={provider === "claude"} onClick={() => { setSetting("aiProvider", "claude"); setKeyDraft(null); }}>Claude · paid</button>
        </div>
        {provider === "gemini" ? (
          <p className="small" style={{ margin: 0 }}>
            Free with a Google account: get a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a> and paste it below. It has a daily limit that resets at midnight Pacific time.{" "}
            <b>On the free tier, Google may use what you send to improve its products, and human reviewers may read it.</b> Only your practice answers are sent, so don't put personal details in them.
          </p>
        ) : (
          <p className="small" style={{ margin: 0 }}>
            The strictest grading (Claude Opus 5). It costs a few cents per grade on your own Anthropic account: get a key at <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">console.anthropic.com</a>.
          </p>
        )}
        <input type="password" autoComplete="off" spellCheck={false} placeholder={provider === "gemini" ? "Gemini API key" : "sk-ant-…"} value={keyDraft ?? (apiKey ? "••••••••••••" + apiKey.slice(-4) : "")} onFocus={() => keyDraft === null && setKeyDraft("")} onChange={(e) => setKeyDraft(e.target.value)} aria-label={`${provider === "gemini" ? "Gemini" : "Anthropic"} API key`} />
        <div className="btns" style={{ display: "flex", gap: 8 }}>
          <button className="btn primary" disabled={!keyDraft?.trim()} onClick={() => { setSetting(keyName, keyDraft!.trim()); setSetting("aiProvider", provider); setKeyDraft(null); setMsg({ kind: "ok", text: "API key saved on this device." }); }}>Save key</button>
          {apiKey && <button className="btn ghost danger" onClick={() => { setSetting(keyName, ""); setKeyDraft(null); }}>Remove</button>}
        </div>
        <p className="muted tiny" style={{ margin: 0 }}>Keys are stored only on this device: never in backups, never in the code. Without a key, you score yourself with the rubric.</p>
      </section>

      <div className="list-label">Appearance</div>
      <div className="seg" role="group" aria-label="Theme">
        {([["system", "phone", "Auto"], ["light", "sun", "Light"], ["dark", "moon", "Dark"]] as const).map(([t, icon, name]) => (
          <button key={t} aria-pressed={theme === t} onClick={() => setSetting("theme", t)}>
            <Icon name={icon} size={15} /> {name}
          </button>
        ))}
      </div>

      <div className="list-label">About</div>
      <section className="card">
        <p className="small" style={{ margin: 0 }}>
          All six stages are built: plan and dashboard; flashcards and grammar; TCF practice, placement and progress checks; writing and speaking; mock exams and analytics. Study content lives in plain JSON files, so more can be added any time.
        </p>
        <p className="muted tiny" style={{ margin: "8px 0 0" }}>
          Everything is stored on this device only, and it works offline. To install: Safari → Share → Add to Home Screen, or Chrome → ⋮ → Install app.
        </p>
      </section>
    </div>
  );
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
