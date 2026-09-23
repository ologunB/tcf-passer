import { useMemo, useState } from "react";
import { Icon, SkillBadge } from "../components/Icon";
import { Ring } from "../components/Ring";
import { db, type Estimate } from "../db";
import { useEntries, useEstimates } from "../hooks";
import { latestBySkill, readiness, type Readiness } from "../lib/adapt";
import { addDays, daysBetween, fmtDay, fmtHours, parseISO } from "../lib/dates";
import { CORE_SKILLS, skillLabel, type CoreSkill } from "../lib/labels";
import { fmtNclc } from "../lib/scoring";
import { loggedMinutes, type Entry } from "../lib/logic";
import { findWeek, plan, type Skill } from "../lib/plan";
import { groupMocks, MockList } from "./Mock";
import "./mock-progress.css";

export function LogPage({ today }: { today: string }) {
  const entries = useEntries();
  const estimates = useEstimates();
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

  if (!entries || !estimates) return null;
  const latest = latestBySkill(estimates);
  const mocks = groupMocks(estimates);

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

      <ReadinessCard latest={latest} ready={readiness(latest)} />

      <div className="list">
        <a className="list-row" href="#/review">
          <span className="ico"><Icon name="note" size={17} /></span>
          <span className="txt"><b>Weekly review</b><span>Time by skill, what moved, what changes next week</span></span>
          <Icon name="chevronR" size={18} />
        </a>
      </div>

      <div className="section-title"><h2>Level over time</h2><span>NCLC by skill</span></div>
      <section className="card">
        <LevelCharts estimates={estimates} today={today} />
      </section>

      <div className="section-title"><h2>Mock exams</h2><a className="small" href="#/mock">Take a mock →</a></div>
      <MockList mocks={mocks} />

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
        <p className="muted tiny" style={{ margin: "14px 0 0" }}>What improved, what's weak and what changes next week: <a href="#/review">weekly review →</a></p>
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
  if (taskId.endsWith("-rebalance")) return "Catch-up drill (plan adjustment)";
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

// ---------- readiness ----------

/** The one question that matters: would today's levels get NCLC 7 in all four? */
export function ReadinessCard({ latest, ready, title = "If you sat the exam today" }: {
  latest: Partial<Record<CoreSkill, Estimate>>;
  ready: Readiness;
  title?: string;
}) {
  const tone = ready.passToday ? (ready.safe ? "good" : "warn") : latest && Object.keys(latest).length ? "bad" : "neutral";
  return (
    <section className="card mp-ready" data-tone={tone}>
      <div className="mp-ready-top">
        <Ring value={ready.score / 100} size={82} stroke={8} track="var(--surface-2)" color="var(--brand)">
          <b className="num">{ready.score}</b>
          <span>of 100</span>
        </Ring>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{title}…</div>
          <p className="mp-answer">{ready.answer}</p>
        </div>
      </div>
      <ul className="mp-chips" aria-label="Latest NCLC by skill">
        {CORE_SKILLS.map((s) => {
          const n = latest[s]?.nclc;
          const state = n === undefined ? "none" : n >= 7 ? "ok" : "no";
          return (
            <li key={s} className={`mp-chip ${state}`} data-skill={s}>
              <Icon name={s} size={14} />
              <span className="mp-chip-l">{skillLabel[s]}</span>
              <b className="num">{n === undefined ? "—" : fmtNclc(n)}</b>
              <Icon name={state === "ok" ? "check" : state === "no" ? "x" : "clock"} size={13} stroke={2.4} />
              <span className="sr-only">{state === "ok" ? "passes NCLC 7" : state === "no" ? "below NCLC 7" : "not tested"}</span>
            </li>
          );
        })}
      </ul>
      <p className="muted tiny" style={{ margin: 0 }}>
        Score = each skill's NCLC against the NCLC 8 target, averaged. It's only a gauge: IRCC counts your weakest skill, so one skill at 6 fails no matter how high the others are.
      </p>
    </section>
  );
}

// ---------- level over time (small multiples) ----------

const Y_MIN = 3;
const Y_MAX = 10;

function LevelCharts({ estimates, today }: { estimates: Estimate[]; today: string }) {
  const sorted = useMemo(() => [...estimates].sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0)), [estimates]);
  if (!sorted.length)
    return <p className="empty">Nothing tested yet. The placement test, progress checks and mocks each add a point here.</p>;
  // One shared x range so the four panels line up.
  const from = sorted[0].date < plan.start ? sorted[0].date : plan.start;
  const lastDate = sorted.at(-1)!.date;
  const to = lastDate > today ? lastDate : today;
  return (
    <>
      <div className="mp-multiples">
        {CORE_SKILLS.map((s) => (
          <LevelPanel key={s} skill={s} points={sorted.filter((e) => e.skill === s)} from={from} to={to} />
        ))}
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        <span><svg width="18" height="6" aria-hidden="true"><line x1="0" x2="18" y1="3" y2="3" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" /></svg> NCLC 7 · pass</span>
        <span><svg width="18" height="6" aria-hidden="true"><line x1="0" x2="18" y1="3" y2="3" stroke="var(--good)" strokeWidth="1.5" opacity="0.8" /></svg> NCLC 8 · safe</span>
      </div>
      <details className="mp-table small">
        <summary>Show as a table</summary>
        <table>
          <thead><tr><th>Date</th><th>Skill</th><th>Score</th><th>NCLC</th><th>From</th></tr></thead>
          <tbody>
            {[...sorted].reverse().map((e) => (
              <tr key={e.id}>
                <td>{fmtDay(e.date, { day: "numeric", month: "short" })}</td>
                <td>{skillLabel[e.skill]}</td>
                <td className="num">{e.score === undefined ? "—" : fmtScore(e)}</td>
                <td className="num">{fmtNclc(e.nclc)}</td>
                <td>{sourceLabel[e.source]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

const sourceLabel: Record<Estimate["source"], string> = { placement: "Placement", check: "Progress check", mock: "Mock", practice: "Practice", graded: "Graded task" };
const fmtScore = (e: Estimate) => (e.skill === "listening" || e.skill === "reading" ? `${e.score}/699` : `${e.score}/20`);

function LevelPanel({ skill, points, from, to }: { skill: CoreSkill; points: Estimate[]; from: string; to: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 160, H = 108, pad = { l: 16, r: 6, t: 8, b: 16 };
  const span = Math.max(1, daysBetween(from, to));
  const x = (d: string) => pad.l + ((W - pad.l - pad.r) * daysBetween(from, d)) / span;
  const y = (n: number) => pad.t + (H - pad.t - pad.b) * (1 - (Math.max(Y_MIN, Math.min(Y_MAX, n)) - Y_MIN) / (Y_MAX - Y_MIN));
  const cur = points.length ? points[sel ?? points.length - 1] : null;
  const month = (d: string) => parseISO(d).toLocaleDateString("en-GB", { month: "short" });

  return (
    <figure className="mp-panel" data-skill={skill}>
      <figcaption>
        <span className="mp-panel-t"><Icon name={skill} size={13} /> {skillLabel[skill]}</span>
        {cur ? (
          <span className="mp-panel-v">
            <b className="num">NCLC {fmtNclc(cur.nclc)}{cur.score !== undefined && <span className="muted tiny"> · {fmtScore(cur)}</span>}</b>
            <span className="muted tiny">{sourceLabel[cur.source]} · {fmtDay(cur.date, { day: "numeric", month: "short" })}</span>
          </span>
        ) : (
          <span className="mp-panel-v"><b className="muted">Not tested</b><span className="muted tiny">no score yet</span></span>
        )}
      </figcaption>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${skillLabel[skill]} NCLC over time: ${points.length ? points.map((p) => `${fmtDay(p.date, { day: "numeric", month: "short" })} ${fmtNclc(p.nclc)}`).join(", ") : "not tested yet"}`}>
        {[4, 10].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 4} y={y(t) + 3} textAnchor="end">{t}</text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(7)} y2={y(7)} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />
        <text x={pad.l - 4} y={y(7) + 3} textAnchor="end" style={{ fill: "var(--ink)" }}>7</text>
        <line x1={pad.l} x2={W - pad.r} y1={y(8)} y2={y(8)} stroke="var(--good)" strokeWidth={1.5} opacity={0.8} />
        <text x={pad.l - 4} y={y(8) + 3} textAnchor="end" style={{ fill: "var(--good)" }}>8</text>
        <text x={pad.l} y={H - 3} textAnchor="start">{month(from)}</text>
        <text x={W - pad.r} y={H - 3} textAnchor="end">{month(to)}</text>
        {points.length > 1 && (
          <path d={points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.nclc).toFixed(1)}`).join(" ")} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {points.map((p, i) => {
          const on = (sel ?? points.length - 1) === i;
          return (
            <g
              key={p.id ?? i}
              tabIndex={0}
              role="button"
              aria-label={`${fmtDay(p.date, { day: "numeric", month: "short" })}: NCLC ${fmtNclc(p.nclc)}, ${sourceLabel[p.source]}`}
              onMouseEnter={() => setSel(i)}
              onFocus={() => setSel(i)}
              onClick={() => setSel(i)}
              style={{ cursor: "pointer", outline: "none" }}
            >
              <circle cx={x(p.date)} cy={y(p.nclc)} r={12} fill="transparent" />
              <circle cx={x(p.date)} cy={y(p.nclc)} r={on ? 5 : 4} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
