import { useState } from "react";
import { completeTask, uncompleteTask } from "../db";
import { fmtDay } from "../lib/dates";
import { eventLabel, skillLabel } from "../lib/labels";
import type { Entry } from "../lib/logic";
import { appSections, resourceById, type Item } from "../lib/plan";
import { fmtClock, useTimer } from "../timer";
import { Icon, SkillBadge } from "./Icon";
import { Sheet } from "./Sheet";

export interface TaskFlags {
  carried?: boolean;
  overdue?: boolean;
  merged?: number;
}

export function TaskTags({ item, flags, entry }: { item: Item; flags?: TaskFlags; entry?: Entry }) {
  return (
    <>
      {item.kind === "event" && <span className={`tag ${item.critical ? "bad" : "brand"}`}>{eventLabel[item.eventType!] ?? "Event"}</span>}
      {flags?.overdue && <span className="tag bad">Overdue · {fmtDay(item.date, { day: "numeric", month: "short" })}</span>}
      {flags?.carried && <span className="tag warn">From yesterday</span>}
      {!!flags?.merged && <span className="tag warn">+{flags.merged} missed folded in</span>}
      <span>{skillLabel[item.skill]}</span>
      <span>·</span>
      <span className="num">{entry ? `${entry.minutes} min logged` : `${item.minutes} min`}</span>
      {entry?.note && <Icon name="note" size={13} />}
    </>
  );
}

export function TaskRow({ item, entry, date, flags, readOnly, onOpen }: {
  item: Item;
  entry?: Entry;
  date: string;
  flags?: TaskFlags;
  readOnly?: boolean;
  onOpen: (item: Item) => void;
}) {
  const done = !!entry;
  const { timer } = useTimer();
  const running = timer?.taskId === item.id;
  const toggle = () => (done ? uncompleteTask(item.id) : completeTask(item.id, date, item.skill, item.minutes));

  return (
    <li className={`task${done ? " done" : ""}${running ? " running" : ""}`} data-skill={item.skill}>
      <button className="task-body" onClick={() => onOpen(item)}>
        <SkillBadge skill={item.skill} />
        <span className="task-text">
          <span className="task-title">{item.title}</span>
          <span className="task-meta">
            {running && <span className="tag skill"><span className="running-dot" /> Timing</span>}
            <TaskTags item={item} flags={flags} entry={entry} />
          </span>
        </span>
      </button>
      {!readOnly && (
        <button className={`check${done ? " on" : ""}`} onClick={toggle} aria-pressed={done} aria-label={done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`}>
          {done && <Icon name="check" size={16} stroke={3} />}
        </button>
      )}
    </li>
  );
}

export function Resources({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {ids.map((id) => {
        const r = resourceById.get(id);
        if (r)
          return (
            <a key={id} className="link-chip" href={r.url} target="_blank" rel="noreferrer">
              {r.name} <Icon name="external" size={14} />
            </a>
          );
        const s = appSections[id];
        if (!s) return null;
        return s.ready ? (
          <a key={id} className="link-chip" href={s.route}>{s.label}</a>
        ) : (
          <span key={id} className="link-chip soon" title="Arrives in a later build stage">{s.label} · soon</span>
        );
      })}
    </div>
  );
}

/** Details for one task: resources, timer, minutes, notes. */
export function TaskSheet({ item, entry, date, flags, readOnly, onClose }: {
  item: Item | null;
  entry?: Entry;
  date: string;
  flags?: TaskFlags;
  readOnly?: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!item} onClose={onClose} title={item?.title}>
      {item && <TaskSheetBody key={item.id} item={item} entry={entry} date={date} flags={flags} readOnly={readOnly} onClose={onClose} />}
    </Sheet>
  );
}

function TaskSheetBody({ item, entry, date, flags, readOnly, onClose }: {
  item: Item;
  entry?: Entry;
  date: string;
  flags?: TaskFlags;
  readOnly?: boolean;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState(entry?.minutes ?? item.minutes);
  const [note, setNote] = useState(entry?.note ?? "");
  const { timer, elapsed, start, pause, finish } = useTimer();
  const running = timer?.taskId === item.id;
  const otherRunning = !!timer && !running;

  const save = async () => {
    await completeTask(item.id, entry?.date ?? date, item.skill, Math.max(0, minutes), note.trim());
    onClose();
  };

  return (
    <>
      <div className="task-meta" data-skill={item.skill} style={{ marginTop: -6 }}>
        <TaskTags item={item} flags={flags} entry={entry} />
      </div>

      {!!flags?.merged && (
        <div className="notice warn">
          <Icon name="alert" size={18} />
          <span>You missed {flags.merged} earlier {skillLabel[item.skill].toLowerCase()} task{flags.merged > 1 ? "s" : ""}. Instead of stacking them up, do today's one as the full, timed version.</span>
        </div>
      )}
      {item.detail && <p style={{ margin: 0 }}>{item.detail}</p>}
      <Resources ids={item.resources} />

      {readOnly ? (
        <p className="muted small" style={{ margin: 0 }}>This day hasn't come yet. You can tick it off when it arrives.</p>
      ) : (
        <>
          {!entry && (
            <div className="card" data-skill={item.skill} style={{ background: "var(--surface-2)", boxShadow: "none", textAlign: "center" }}>
              <div className="timer num">{fmtClock(running ? elapsed : 0)}</div>
              <div className="timer-sub">
                {running ? (timer!.startedAt ? "Timing… the minutes log themselves when you finish" : "Paused") : `Planned: ${item.minutes} min`}
              </div>
              <div className="focus-actions" style={{ justifyContent: "center" }}>
                {!running ? (
                  <button className="btn primary lg" onClick={() => start(item)} disabled={otherRunning}>
                    <Icon name="play" size={16} /> Start timer
                  </button>
                ) : (
                  <>
                    {timer!.startedAt ? (
                      <button className="btn soft lg" onClick={pause}><Icon name="pause" size={16} /> Pause</button>
                    ) : (
                      <button className="btn soft lg" onClick={() => start(item)}><Icon name="play" size={16} /> Resume</button>
                    )}
                    <button className="btn primary lg" onClick={() => finish(date).then(onClose)}>
                      <Icon name="check" size={18} stroke={2.6} /> Finish
                    </button>
                  </>
                )}
              </div>
              {otherRunning && <p className="muted tiny" style={{ margin: "10px 0 0" }}>Another task's timer is running: “{timer!.title}”.</p>}
            </div>
          )}

          <div className="field">
            {entry ? "Minutes logged" : "Or log it yourself"}
            <div className="stepper">
              <button onClick={() => setMinutes((m) => Math.max(0, m - 5))} aria-label="5 minutes less">−</button>
              <output className="num">{minutes}<small> min</small></output>
              <button onClick={() => setMinutes((m) => Math.min(600, m + 5))} aria-label="5 minutes more">+</button>
            </div>
          </div>
          <label className="field">
            Notes
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What went well? What was hard?" />
          </label>
          <div style={{ display: "grid", gap: 8 }}>
            <button className="btn dark lg block" onClick={save}>
              <Icon name="check" size={18} stroke={2.6} /> {entry ? "Save changes" : "Mark done"}
            </button>
            {entry && (
              <button className="btn ghost block" onClick={() => uncompleteTask(item.id).then(onClose)}>
                Mark as not done
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
