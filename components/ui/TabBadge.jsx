import React from "react";

export default function TabBadge({ done }) {
  return (
    <span
      className={`tab-badge ${done ? "is-done" : "is-missing"}`}
      aria-label={done ? "Tamamlandi" : "Eksik"}
    >
      {done ? "✓" : ""}
    </span>
  );
}
