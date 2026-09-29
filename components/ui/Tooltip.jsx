import React from "react";

function normalizeLines(lines, text) {
  if (Array.isArray(lines)) {
    return lines.map((line) => String(line)).filter((line) => line.trim().length > 0);
  }
  if (typeof text === "string") {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

export default function Tooltip({ text, lines, children, className = "" }) {
  const resolved = normalizeLines(lines, text);
  if (!resolved.length) return children;

  return (
    <span className={`tooltip-wrap ${className}`.trim()}>
      {children}
      <span className="tooltip-bubble" role="tooltip">
        {resolved.map((line, idx) => (
          <div key={`${idx}-${line}`} className="tooltip-line">
            {line}
          </div>
        ))}
      </span>
    </span>
  );
}
