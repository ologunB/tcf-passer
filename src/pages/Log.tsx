import { useMemo, useState } from "react";
import { Icon, SkillBadge } from "../components/Icon";
import { db } from "../db";
import { useEntries } from "../hooks";
import { addDays, fmtDay, fmtHours } from "../lib/dates";
import { skillLabel } from "../lib/labels";
import { loggedMinutes, type Entry } from "../lib/logic";
import { findWeek, plan, type Skill } from "../lib/plan";

export function LogPage({ today }: { today: string }) {
  const entries = useEntries();
  const [showAll, setShowAll] = useState(false);

  const current = findWeek(plan, today)?.week ?? (today < plan.start ? 0 : plan.weeks.length);
  const weeks = plan.weeks.slice(Math.max(0, current - 8), current);

  const bySkill = useMemo(() => {
    const from = addDays(today, -6);
    const m = new Map<Skill, number>();
    for (const e of entries ?? []) if (e.date >= from && e.date <= today) m.set(e.skill, (m.get(e.skill) ?? 0) + e.minutes);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries, today]);

  const days = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of [...(entries ?? [])].sort((a, b) => b.createdAt - a.createdAt)) {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date)!.push(e);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  if (!entries) return null;

  const week7 = loggedMinutes(entries, addDays(today, -6), today);
  const total = entries.reduce((a, e) => a + e.minutes, 0);
  const activeDays = new Set(entries.map((e) => e.date)).size;
  const maxSkill = Math.max(1, ...bySkill.map(([, m]) => m));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Log & review</div>
          <h1 className="title">Progrès<em>.</em></h1>
        </div>
      </header>

      <div className="grid-3">
        <div className="stat"><div className="v num">{fmtHours(week7)}</div><div className="k">last 7 days</div></div>
        <div className="stat"><div className="v num">{fmtHours(week7 / 7)}</div><div className="k">a day on average</div></div>
        <div className="stat"><div className="v num">{fmtHours(total)}</div><div className="k">total · {activeDays} day{activeDays === 1 ? "" : "s"}</div></div>
      </div>

      <div className="section-title"><h2>Hours per week</h2><span>bar = logged · tick = planned</span></div>
      <section className="card">
        {weeks.length === 0 ? <p className="empty">Your weeks show up here once week 1 starts.</p> : <WeekChart weeks={weeks} entries={entries} today={today} />}
      </section>

      <div className="section-title"><h2>Last 7 days by skill</h2></div>
      <section className="card">
        {bySkill.length === 0 ? (
          <p className="empty">Nothing logged in the last 7 days.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {bySkill.map(([s, m]) => (
              <div key={s} style={{ display: "grid", gridTemplateColumns: "28px 88px 1fr 52px", gap: 10, alignItems: "center" }} title={`${skillLabel[s]}: ${fmtHours(m)}`}>
                <SkillBadge skill={s} size={28} />
                <span className="small" style={{ fontWeight: 550 }}>{skillLabel[s]}</span>
                <div style={{ height: 10, borderRadius: 5, background: "var(--surface-2)" }}>
                  <div style={{ width: `${(m / maxSkill) * 100}%`, height: "100%", borderRadius: 5, background: "var(--brand)" }} />
                </div>
                <span className="small num" style={{ textAlign: "right" }}>{fmtHours(m)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="muted tiny" style={{ margin: "14px 0 0" }}>The full weekly review (what improved, what's weak, what changes next week) comes with the tests in stage 4.</p>
      </section>

      <div className="section-title"><h2>History</h2></div>
      {days.length === 0 && <section className="card"><p className="empty">Nothing logged yet. Tick off tasks on Today, or tap + to log extra study.</p></section>}
      {(showAll ? days : days.slice(0, 7)).map(([date, list]) => (
        <section key={date} className="card flush history-day">
          <div className="history-head">
            <b>{fmtDay(date, { weekday: "long", day: "numeric", month: "short" })}</b>
            <span className="muted small num">{fmtHours(list.reduce((a, e) => a + e.minutes, 0))}</span>
          </div>
          <ul className="tasks">
            {list.map((e) => (
              <li key={e.id} className="task" data-skill={e.skill}>
                <SkillBadge skill={e.skill} size={34} />
                <span className="task-text">
                  <span className="task-title">{titleFor(e.taskId) ?? (e.note || "Extra study")}</span>
                  <span className="task-meta">
                    <span>{skillLabel[e.skill]}</span><span>·</span><span className="num">{e.minutes} min</span>
                    {!e.taskId && <span className="tag">extra</span>}
                    {e.taskId && e.note && <><span>·</span><span>{e.note}</span></>}
                  </span>
                </span>
                <button className="icon-btn" style={{ border: 0, background: "transparent", color: "var(--faint)" }} onClick={() => db.entries.delete(e.id!)} aria-label="Delete entry">
                  <Icon name="trash" size={17} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {days.length > 7 && (
        <button className="btn soft block" onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : `Show all ${days.length} days`}</button>
      )}
    </div>
  );
}

function titleFor(taskId: string | null) {
  if (!taskId) return null;
  const date = taskId.slice(0, 10);
  const d = findWeek(plan, date)?.days.find((x) => x.date === date);
  return d?.tasks.find((t) => t.id === taskId)?.title ?? d?.events.find((e) => `${e.date}-ev-${e.type}` === taskId)?.title ?? null;
}

/** One series (logged hours), with the plan as a target tick — one axis, no second series. */
function WeekChart({ weeks, entries, today }: { weeks: typeof plan.weeks; entries: Entry[]; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = weeks.map((w) => {
    const end = w.days.at(-1)!.date;
    const to = end < today ? end : today;
    const planned = w.days.filter((d) => d.date <= to).reduce((a, d) => a + d.plannedMinutes, 0) / 60;
    const full = w.plannedHours;
    return { week: w.week, logged: loggedMinutes(entries, w.start, end) / 60, planned, full };
  });
  const W = 320, H = 150, pad = { l: 26, r: 6, t: 10, b: 22 };
  const max = Math.max(10, ...data.map((d) => Math.max(d.logged, d.full)));
  const niceMax = Math.ceil(max / 10) * 10;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / niceMax);
  const slot = (W - pad.l - pad.r) / Math.max(data.length, 4);
  const bw = Math.min(26, slot * 0.56);
  const ticks = [0, niceMax / 2, niceMax];
  const h = hover !== null ? data[hover] : data.at(-1)!;

  return (
    <>
      <div className="spread" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span className="small"><b>Week {h.week}</b> <span className="muted">{hover === null ? "(this week)" : ""}</span></span>
        <span className="small num"><b>{h.logged.toFixed(1)} h</b> <span className="muted">of {h.planned.toFixed(1)} h planned so far</span></span>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hours logged per week compared with the plan">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const top = y(d.logged);
          const base = y(0);
          const r = Math.min(4, (base - top) / 2);
          return (
            <g key={d.week} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)} style={{ cursor: "pointer" }}>
              <rect x={cx - slot / 2} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
              {d.logged > 0 && (
                <path
                  d={`M${cx - bw / 2},${base} V${top + r} q0,-${r} ${r},-${r} H${cx + bw / 2 - r} q${r},0 ${r},${r} V${base} Z`}
                  fill="var(--brand)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              <line x1={cx - bw / 2 - 3} x2={cx + bw / 2 + 3} y1={y(d.full)} y2={y(d.full)} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" opacity={0.55} />
              <text x={cx} y={H - 6} textAnchor="middle">W{d.week}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend" style={{ marginTop: 8 }}>
        <span><i style={{ background: "var(--brand)" }} /> Hours logged</span>
        <span><i style={{ background: "var(--ink)", opacity: 0.55, height: 2, borderRadius: 1 }} /> Planned for the week</span>
      </div>
    </>
  );
}
