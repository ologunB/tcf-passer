import { useState } from "react";
import { Icon } from "../components/Icon";
import { resources } from "../lib/plan";

const SKILLS = ["listening", "reading", "writing", "speaking", "grammar", "vocabulary"] as const;
const LEVELS = ["A1", "A2", "B1", "B2"];
const label = (s: string) => s[0].toUpperCase() + s.slice(1);

export function ResourcesPage() {
  const [q, setQ] = useState("");
  const [skill, setSkill] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [cost, setCost] = useState<"all" | "free" | "paid">("all");

  const query = q.trim().toLowerCase();
  const list = resources
    .filter(
      (r) =>
        (!skill || r.skills.includes(skill)) &&
        (!level || r.levels.includes(level)) &&
        (cost === "all" || (cost === "paid") === r.paid) &&
        (!query || `${r.name} ${r.use} ${r.type}`.toLowerCase().includes(query)),
    )
    .sort((a, b) => Number(a.paid) - Number(b.paid));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{resources.length} researched · free first</div>
          <h1 className="title">Ressources<em>.</em></h1>
        </div>
      </header>

      <div className="search">
        <Icon name="search" size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search podcasts, simulators, tutors…" aria-label="Search resources" />
      </div>

      <div className="seg" role="group" aria-label="Cost">
        {(["all", "free", "paid"] as const).map((c) => (
          <button key={c} aria-pressed={cost === c} onClick={() => setCost(c)}>
            {c === "all" ? "All" : c === "free" ? "Free" : "Paid"}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Skill">
        <button aria-pressed={!skill} onClick={() => setSkill(null)}>All skills</button>
        {SKILLS.map((s) => (
          <button key={s} aria-pressed={skill === s} onClick={() => setSkill(skill === s ? null : s)} data-skill={s}>
            <span style={{ display: "inline-flex", color: skill === s ? "inherit" : "var(--c)" }}><Icon name={s} size={15} /></span>
            {label(s)}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Level">
        <button aria-pressed={!level} onClick={() => setLevel(null)}>Any level</button>
        {LEVELS.map((l) => (
          <button key={l} aria-pressed={level === l} onClick={() => setLevel(level === l ? null : l)}>{l}</button>
        ))}
      </div>

      <p className="muted small" style={{ margin: "0 4px" }}>{list.length} result{list.length === 1 ? "" : "s"}</p>
      {list.length === 0 && <section className="card"><p className="empty">Nothing matches. Try clearing a filter.</p></section>}
      <div style={{ display: "grid", gap: 10 }}>
        {list.map((r) => (
          <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="res" data-skill={r.skills[0] ?? "planning"}>
            <span className="res-avatar">{r.name.replace(/^[^A-Za-zÀ-ÿ0-9]+/, "")[0]}</span>
            <span className="res-body">
              <span className="res-name">
                <span>{r.name}</span>
                <Icon name="external" size={15} className="muted" />
              </span>
              <span className="res-use" style={{ display: "block" }}>{r.use}</span>
              <span className="task-meta">
                <span className={`tag ${r.paid ? "warn" : "good"}`}>{r.paid ? "Paid" : "Free"}</span>
                <span className="tag">{r.levels.length ? (r.levels.length > 1 ? `${r.levels[0]}–${r.levels.at(-1)}` : r.levels[0]) : "All levels"}</span>
                {r.skills.slice(0, 3).map((s) => <span key={s} className="tag">{s}</span>)}
                {r.status === "bot-protected" && <span className="tag" title="Blocks automated link checks; opens normally in a browser">not auto-checked</span>}
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
