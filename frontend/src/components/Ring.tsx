import type { ReactNode } from "react";

export function Ring({ value, size = 96, stroke = 9, children, track = "var(--ring-track)", color = "var(--brand)" }: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  children?: ReactNode;
  track?: string;
  color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}
