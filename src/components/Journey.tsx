import { daysBetween } from "../lib/dates";
import { plan } from "../lib/plan";

const totalDays = plan.weeks.length * 7;
const short: Record<string, string> = { foundations: "A1", survival: "A2", independent: "B1", "exam-ready": "B2", sprint: "Exam" };

/** Whole plan as a bar: one segment per phase, filled up to today, red marker where you are. */
export function Journey({ today }: { today: string }) {
  const pos = Math.max(0, Math.min(1, daysBetween(plan.start, today) / totalDays));
  return (
    <div className="journey" aria-label={`${Math.round(pos * 100)}% of the way through the plan`}>
      <div className="journey-bar">
        {plan.phases.map((p) => {
          const from = (p.weeks[0] - 1) / plan.weeks.length;
          const to = p.weeks[1] / plan.weeks.length;
          const fill = Math.max(0, Math.min(1, (pos - from) / (to - from)));
          return (
            <div key={p.id} style={{ flex: p.weeks[1] - p.weeks[0] + 1 }}>
              <i style={{ width: `${fill * 100}%` }} />
            </div>
          );
        })}
        <span className="journey-marker" style={{ left: `${pos * 100}%` }} />
      </div>
      <div className="journey-labels">
        {plan.phases.map((p) => (
          <span key={p.id} style={{ flex: p.weeks[1] - p.weeks[0] + 1 }}>{short[p.id] ?? p.level}</span>
        ))}
      </div>
    </div>
  );
}
