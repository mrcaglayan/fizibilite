import React from "react";
import Tooltip from "./Tooltip";

function normalizeLines(lines) {
  if (!lines) return [];
  if (Array.isArray(lines)) return lines.map((line) => String(line));
  if (typeof lines === "string") return lines.split("\n");
  return [];
}

export default function ProgressBar({ value = 0, label = "", tooltipLines }) {
  const numeric = Number(value);
  const pct = Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
  const lines = normalizeLines(tooltipLines).filter((line) => String(line).trim().length > 0);

  const track = (
    <div className="progress-track">
      <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );

  return (
    <div className="progress-row">
      {label ? <div className="progress-label">{label}</div> : null}
      {lines.length ? (
        <Tooltip lines={lines} className="progress-tooltip">
          {track}
        </Tooltip>
      ) : (
        track
      )}
      <div className="progress-value">{Math.round(pct)}%</div>
    </div>
  );
}
