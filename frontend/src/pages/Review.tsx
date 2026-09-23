import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Icon, SkillBadge } from "../components/Icon";
import { db } from "../db";
import { useEntries, useEstimates } from "../hooks";
import { latestBySkill, weeklyReview } from "../lib/adapt";
import { fmtDay, fmtHours } from "../lib/dates";
import { skillLabel } from "../lib/labels";
import { plan, type Skill } from "../lib/plan";
import { fmtNclc } from "../lib/scoring";
import { ReadinessCard } from "./Log";
import "./mock-progress.css";

export function ReviewPage({ today }: { today: string }) {
  const entries = useEntries();
  const estimates = useEstimates();
  const attempts = useLiveQuery(() => db.attempts.toArray(), []);
  const r = useMemo(
    () => (entries && estimates && attempts ? weeklyReview(plan, entries, estimates, attempts, today) : null),
    [entries, estimates, attempts, today],
  );
  if (!r || !estimates) return null;

  const latest = latestBySkill(estimates.filter((e) => e.date <= today));
  const skills = (Object.entries(r.minutesBySkill) as [Skill, { thisWeek: number; lastWeek: number }][]).sort(
    (a, b) => b[1].thisWeek - a[1].thisWeek || b[1].lastWeek - a[1].lastWeek,
  );
  const max = Math.max(1, ...skills.map(([, m]) => Math.max(m.thisWeek, m.lastWeek)));
  const upTo = today < r.weekEnd ? today : r.weekEnd;
  const pct = Math.round(r.hours.ratio * 100);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Weekly review · {r.week ? `week ${r.week}` : "before week 1"}</div>
          <h1 className="title">Bilan<em>.</em></h1>
        </div>
        <a className="btn ghost" href="#/log"><Icon name="chevronL" size={16} /> Progress</a>
      </header>
      <p className="muted small" style={{ margin: "-6px 2px 0" }}>
        {fmtDay(r.weekStart, { day: "numeric", month: "short" })} – {fmtDay(upTo, { day: "numeric", month: "short" })}
        {upTo < r.weekEnd && " (week still running)"}
      </p>

      <div className="grid-3">
        <div className="stat"><div className="v num">{fmtHours(r.hours.logged)}</div><div className="k">logged this week</div></div>
        <div className="stat"><div className="v num">{fmtHours(r.hours.planned)}</div><div className="k">planned so far</div></div>
        <div className="stat">
          <div className="v num" style={{ color: r.hours.planned ? (pct >= 80 ? "var(--good)" : "var(--bad)") : undefined }}>{r.hours.planned ? `${pct}%` : "—"}</div>
          <div className="k">{r.hours.planned ? (pct >= 80 ? "above the 80% line" : "below the 80% line") : "nothing planned yet"}</div>
        </div>
      </div>

      <ReadinessCard latest={latest} ready={r.readiness} />

      <div className="section-title"><h2>What changes next week</h2></div>
      <section className="card">
        {r.nextWeek.length ? (
          <ul className="mp-bullets" data-kind="next">
            {r.nextWeek.map((x) => <li key={x}><Icon name="chevronR" size={15} /><span>{x}</span></li>)}
          </ul>
        ) : (
          <p className="empty">Nothing changes: the plan runs as written. Take a test so the app has something to adapt to.</p>
        )}
      </section>

      <div className="section-title"><h2>Wins</h2><span>{r.wins.length}</span></div>
      <section className="card">
        {r.wins.length ? (
          <ul className="mp-bullets" data-kind="win">
            {r.wins.map((x) => <li key={x}><Icon name="check" size={15} stroke={2.4} /><span>{x}</span></li>)}
          </ul>
        ) : (
          <p className="empty">Nothing to call a win yet this week. That's information too.</p>
        )}
      </section>

      <div className="section-title"><h2>Concerns</h2><span>{r.concerns.length}</span></div>
      <section className="card">
        {r.concerns.length ? (
          <ul className="mp-bullets" data-kind="concern">
            {r.concerns.map((x) => <li key={x}><Icon name="alert" size={15} /><span>{x}</span></li>)}
          </ul>
        ) : (
          <p className="empty">No concerns this week.</p>
        )}
      </section>

      <div className="section-title"><h2>Time by skill</h2><span>bar = this week · tick = last week</span></div>
      <section className="card">
        {skills.length === 0 ? (
          <p className="empty">Nothing logged this week or last.</p>
        ) : (
          <div className="mp-skillbars">
            {skills.map(([s, m]) => {
              const diff = m.thisWeek - m.lastWeek;
              return (
                <div key={s} className="mp-skillbar" data-skill={s} title={`${skillLabel[s]}: ${fmtHours(m.thisWeek)} this week, ${fmtHours(m.lastWeek)} last week`}>
                  <SkillBadge skill={s} size={28} />
                  <span className="small" style={{ fontWeight: 550 }}>{skillLabel[s]}</span>
                  <div className="mp-track">
                    {m.thisWeek > 0 && <i style={{ width: `${(m.thisWeek / max) * 100}%` }} />}
                    {m.lastWeek > 0 && <b style={{ left: `calc(${(m.lastWeek / max) * 100}% - 1px)` }} />}
                  </div>
                  <span className="small num" style={{ textAlign: "right" }}>
                    {fmtHours(m.thisWeek)}
                    <span className="muted tiny" style={{ display: "block" }}>{diff === 0 ? "same" : `${diff > 0 ? "+" : "−"}${fmtHours(Math.abs(diff))}`}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="section-title"><h2>Level changes</h2><span>since last week</span></div>
      <div className="list">
        {r.estimateChanges.map((c) => (
          <div key={c.skill} className="list-row">
            <SkillBadge skill={c.skill} size={34} />
            <span className="txt">
              <b>{skillLabel[c.skill]}</b>
              <span>
                {!c.to
                  ? "Not tested yet"
                  : c.from && c.to.date < r.weekStart
                    ? `No new test this week (last: ${fmtDay(c.to.date, { day: "numeric", month: "short" })})`
                    : c.from
                      ? `Tested ${fmtDay(c.to.date, { day: "numeric", month: "short" })}`
                      : `First test: ${fmtDay(c.to.date, { day: "numeric", month: "short" })}`}
              </span>
            </span>
            <span className="mp-change num">
              {c.to ? (
                <>
                  {c.from && c.from !== c.to && <span className="muted">{fmtNclc(c.from.nclc)} → </span>}
                  <b>NCLC {fmtNclc(c.to.nclc)}</b>
                  {c.delta !== undefined && c.delta !== 0 && (
                    <span className={`tag ${c.delta > 0 ? "good" : "bad"}`}>{c.delta > 0 ? `+${c.delta}` : `−${-c.delta}`}</span>
                  )}
                </>
              ) : (
                <span className="muted">—</span>
              )}
            </span>
          </div>
        ))}
      </div>
      {r.attempts.count > 0 && (
        <p className="muted tiny" style={{ margin: "-4px 4px 0" }}>
          TCF-style questions this week: {r.attempts.correct}/{r.attempts.total} right across {r.attempts.count} set{r.attempts.count > 1 ? "s" : ""}.
        </p>
      )}
    </div>
  );
}
