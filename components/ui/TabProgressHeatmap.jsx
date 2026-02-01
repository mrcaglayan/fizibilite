import React from "react";
import { FaInfoCircle } from "react-icons/fa";

function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function buildTitle({ pct, title, missingPreview, missingLines }) {
  const lines = Array.isArray(missingLines)
    ? missingLines.map((line) => String(line)).filter(Boolean).slice(0, 15)
    : [];
  if (lines.length) return lines.join("\n");
  if (missingPreview) return String(missingPreview);
  if (title) return `${title}: ${pct}%`;
  return `${pct}%`;
}

export default function TabProgressHeatmap({
  pct = 0,
  title = "",
  missingPreview = "",
  missingLines = [],
  children,
}) {
  const clamped = clampPct(pct);
  const mask = `linear-gradient(90deg, #000 0%, #000 ${clamped}%, transparent ${clamped}%, transparent 100%)`;
  const tooltipText = buildTitle({
    pct: Math.round(clamped),
    title,
    missingPreview,
    missingLines,
  });
  const showInfo = clamped < 100;

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 12 }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          backgroundImage:
            "linear-gradient(90deg, rgba(16,185,129, 0.05) 0%, rgba(16,185,129, 0.10) 30%, rgba(16,185,129, 0.16) 70%, rgba(16,185,129, 0.10) 100%), radial-gradient(circle at 20% 45%, rgba(16,185,129, 0.14) 0%, rgba(16,185,129, 0.00) 65%)",
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      />

      {showInfo ? (
        <button
          type="button"
          title={tooltipText}
          aria-label="Progress details"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 20,
            width: 26,
            height: 26,
            borderRadius: 999,
            border: "1px solid rgba(15, 23, 42, 0.15)",
            background: "rgba(255, 255, 255, 0.9)",
            color: "#0f172a",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "help",
            boxShadow: "0 6px 16px rgba(15, 23, 42, 0.08)",
          }}
        >
          <FaInfoCircle size={12} />
        </button>
      ) : null}

      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
