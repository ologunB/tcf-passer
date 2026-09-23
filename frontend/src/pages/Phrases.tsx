import { useState } from "react";
import { Icon } from "../components/Icon";
import { phraseGroups } from "../lib/content";
import { speak } from "../lib/tts";

/** Ready-made French phrases for the writing and speaking tasks, with audio. */
export function PhrasesPage(_: { today: string }) {
  const [open, setOpen] = useState<string | null>(phraseGroups[0]?.id ?? null);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const groups = phraseGroups
    .map((g) => ({ ...g, phrases: query ? g.phrases.filter(([fr, en]) => `${fr} ${en}`.toLowerCase().includes(query)) : g.phrases }))
    .filter((g) => g.phrases.length);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><a href="#/study">Study</a> · writing & speaking</div>
          <h1 className="title">Phrases<em>.</em></h1>
        </div>
      </header>
      <p className="muted small" style={{ margin: "0 2px" }}>
        Learn these by heart. They're the structure examiners look for: openings, connectors, opinions, concessions, polite questions. Tap a phrase to hear it.
      </p>
      <div className="search">
        <Icon name="search" size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: opinion, however, invite…" aria-label="Search phrases" />
      </div>
      {!phraseGroups.length && <section className="card"><p className="empty">The phrase bank is being added.</p></section>}
      {groups.map((g) => {
        const isOpen = !!query || open === g.id;
        return (
          <section key={g.id} className="card flush">
            <button className="group-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.id)} style={{ color: "var(--ink)" }}>
              <span style={{ textAlign: "left" }}>
                <b style={{ display: "block", fontSize: "1rem" }}>{g.title}</b>
                <span className="muted small" style={{ fontWeight: 500 }}>{g.use}</span>
              </span>
              <Icon name="chevronD" size={18} />
            </button>
            {isOpen && (
              <div>
                {g.phrases.map(([fr, en]) => (
                  <div key={fr} className="phrase">
                    <button className="icon-btn" onClick={() => speak(fr, { rate: 0.9 })} aria-label={`Hear: ${fr}`}><Icon name="listening" size={16} /></button>
                    <div>
                      <div className="fr" lang="fr">{fr}</div>
                      <div className="en">{en}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
