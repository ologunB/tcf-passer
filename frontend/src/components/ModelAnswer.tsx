import { useState } from "react";
import { countWords, modelAnswers } from "../lib/content";
import { speak, stop } from "../lib/tts";
import { Icon } from "./Icon";

/** A B2 model answer for a writing or speaking prompt, hidden until asked for so it doesn't spoil the attempt. */
export function ModelAnswer({ promptId, spoken = false }: { promptId: string; spoken?: boolean }) {
  const m = modelAnswers[promptId];
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  if (!m) return null;
  const listen = async () => {
    if (playing) {
      stop();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    await speak(m.text.replace(/^(Candidat|Examinateur)\s*:\s*/gm, ""), { rate: 0.95 });
    setPlaying(false);
  };
  return (
    <section className="card" data-skill={spoken ? "speaking" : "writing"}>
      <button className="group-toggle" style={{ padding: 0, color: "var(--ink)" }} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Icon name="sparkle" size={16} /> <b>Model answer (B2)</b>
          <span className="tag skill num">{countWords(m.text)} words</span>
        </span>
        <Icon name="chevronD" size={18} />
      </button>
      {open && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <p className="muted tiny" style={{ margin: 0 }}>Try the task yourself first. Copying doesn't build the skill; comparing does.</p>
          {spoken && (
            <button className="btn soft" onClick={listen}><Icon name={playing ? "pause" : "play"} size={14} /> {playing ? "Stop" : "Listen to it"}</button>
          )}
          <div className="model-text" lang="fr">{m.text}</div>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            {m.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
