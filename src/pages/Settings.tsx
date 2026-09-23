import { useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { exportAll, importAll, setSetting } from "../db";
import { useExamDate, useSetting } from "../hooks";
import { fmtDay } from "../lib/dates";
import { examEvent, plan } from "../lib/plan";

export type Theme = "system" | "light" | "dark";

export function SettingsPage({ today }: { today: string }) {
  const examDate = useExamDate();
  const theme = useSetting<Theme>("theme", "system");
  const lastExport = useSetting<string | null>("lastExport", null);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    const data = await exportAll();
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
          Build stage 2 of 6: dashboard, daily tasks, timer and logging. Coming next: flashcards and grammar drills, then TCF practice and the placement test, writing and speaking, then full mock exams and analytics.
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
