import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { TaskRow, TaskSheet } from "../components/Task";
import { useDone, useEntries } from "../hooks";
import { fmtDay, fmtHours, parseISO } from "../lib/dates";
import { eventLabel } from "../lib/labels";
import { dayItems, findWeek, phaseOf, plan } from "../lib/plan";

export function PlanPage({ today }: { today: string }) {
  const entries = useEntries();
  const done = useDone(entries);
  const byTask = useMemo(() => new Map((entries ?? []).filter((e) => e.taskId).map((e) => [e.taskId!, e])), [entries]);
  const current = (findWeek(plan, today) ?? plan.weeks[0]).week;
  const [n, setN] = useState(current);
  const week = plan.weeks[n - 1];
  const [day, setDay] = useState(() => (week.days.some((d) => d.date === today) ? today : week.days[0].date));
  const [openId, setOpenId] = useState<string | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chipsRef.current?.querySelector<HTMLElement>(`[data-week="${n}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [n]);

  const pickWeek = (w: number) => {
    setN(w);
    const days = plan.weeks[w - 1].days;
    setDay(days.some((d) => d.date === today) ? today : days[0].date);
  };

  const phase = phaseOf(plan, week);
  const items = dayItems(plan, day);
  const open = items.find((i) => i.id === openId) ?? null;
  const weekLogged = week.days.reduce((a, d) => a + dayItems(plan, d.date).reduce((b, i) => b + (byTask.get(i.id)?.minutes ?? 0), 0), 0);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{plan.weeks.length} weeks · ~{plan.weeklyHoursTarget} h a week</div>
          <h1 className="title">Le plan<em>.</em></h1>
        </div>
        {n !== current && (
          <button className="btn soft" onClick={() => pickWeek(current)}>This week</button>
        )}
      </header>

      <div className="week-chips" ref={chipsRef} role="tablist" aria-label="Weeks">
        {plan.weeks.map((w) => (
          <button
            key={w.week}
            data-week={w.week}
            className={`week-chip${w.week === current ? " current" : ""}${w.week === plan.firstSittingWeek ? " exam" : ""}`}
            aria-pressed={w.week === n}
            onClick={() => pickWeek(w.week)}
          >
            <small>{w.week === plan.firstSittingWeek ? "EXAM" : w.level}</small>
            <b>{w.week}</b>
          </button>
        ))}
      </div>

      <section className="card">
        <div className="eyebrow" style={{ color: "var(--brand)" }}>{phase.name} · {phase.level}</div>
        <div style={{ fontFamily: "var(--serif)", fontSize: "1.3rem", fontWeight: 600, margin: "4px 0 10px" }}>
          Week {week.week} · {fmtDay(week.start, { day: "numeric", month: "short" })} – {fmtDay(week.days.at(-1)!.date, { day: "numeric", month: "short" })}
        </div>
        <div className="grid-2 focus-tiles">
          <div className="tile" style={{ background: "var(--surface-2)", border: 0 }}><div className="k"><Icon name="grammar" size={14} /> Grammaire</div><div className="v small">{week.focus.grammar}</div></div>
          <div className="tile" style={{ background: "var(--surface-2)", border: 0 }}><div className="k"><Icon name="vocabulary" size={14} /> Vocabulaire</div><div className="v small">{week.focus.vocab}</div></div>
        </div>
        <p className="muted small" style={{ margin: "12px 0 0" }}>
          {week.plannedHours} h planned · {fmtHours(weekLogged)} logged from ticked tasks
        </p>
      </section>

      <div className="days">
        {week.days.map((d) => {
          const its = dayItems(plan, d.date);
          const doneN = its.filter((i) => done.has(i.id)).length;
          return (
            <button
              key={d.date}
              className={`day${d.date === today ? " today" : ""}`}
              aria-pressed={d.date === day}
              onClick={() => setDay(d.date)}
              aria-label={fmtDay(d.date, { weekday: "long", day: "numeric", month: "long" })}
            >
              <small>{parseISO(d.date).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</small>
              <b className="num">{parseISO(d.date).getDate()}</b>
              <span className="day-progress"><i style={{ width: `${(doneN / Math.max(1, its.length)) * 100}%` }} /></span>
              <span className="dots">{d.events.slice(0, 2).map((e) => <i key={e.type} />)}</span>
            </button>
          );
        })}
      </div>

      <div className="section-title">
        <h2>{fmtDay(day, { weekday: "long", day: "numeric", month: "short" })}</h2>
        <span className="num">{fmtHours(items.reduce((a, i) => a + i.minutes, 0))}</span>
      </div>
      <section className="card flush">
        <ul className="tasks">
          {items.map((i) => (
            <TaskRow key={i.id} item={i} entry={byTask.get(i.id)} date={day} readOnly={day > today} onOpen={(it) => setOpenId(it.id)} />
          ))}
        </ul>
      </section>

      <div className="section-title"><h2>The journey</h2><span>A0 → NCLC 7</span></div>
      <section className="card">
        <div className="phase-list">
          {plan.phases.map((p, idx) => {
            const state = p.id === phase.id ? "cur" : p.weeks[1] < current ? "past" : "";
            return (
              <div key={p.id} className={`phase-row ${state}`}>
                <div className="phase-rail">
                  <span className="dot" />
                  {idx < plan.phases.length - 1 && <span className="rail" />}
                </div>
                <div className="phase-body">
                  <div className="spread" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <b>{p.name} · {p.level}</b>
                    <span className="muted tiny num">wk {p.weeks[0]}–{p.weeks[1]} · {p.goalHoursCumulative} h</span>
                  </div>
                  <div className="muted small" style={{ marginTop: 2 }}>{p.exit}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="section-title"><h2>Key dates</h2></div>
      <section className="card">
        <ul className="timeline">
          {[...plan.milestones]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((m) => (
              <li key={m.date + m.type} className={`${m.date < today ? "past" : ""}${m.critical ? " critical" : ""}`}>
                <div className="when">
                  <b className="num">{parseISO(m.date).getDate()}</b>
                  <small>{parseISO(m.date).toLocaleDateString("en-GB", { month: "short" })} {String(parseISO(m.date).getFullYear()).slice(2)}</small>
                </div>
                <div>
                  <span className={`tag ${m.critical ? "bad" : "brand"}`}>{eventLabel[m.type]}</span>
                  <div className="small" style={{ marginTop: 4 }}>{m.title}</div>
                </div>
              </li>
            ))}
        </ul>
      </section>

      <TaskSheet item={open} entry={open ? byTask.get(open.id) : undefined} date={day} readOnly={day > today} onClose={() => setOpenId(null)} />
    </div>
  );
}
