// frontend/src/components/NumberInput.jsx

import React, { useEffect, useMemo, useState } from "react";

const DEFAULT_LOCALE = "tr-TR";

const separatorsCache = new Map();

function getSeparators(locale) {
  if (separatorsCache.has(locale)) return separatorsCache.get(locale);
  const parts = new Intl.NumberFormat(locale).formatToParts(1000.1);
  const group = parts.find((p) => p.type === "group")?.value || ",";
  const decimal = parts.find((p) => p.type === "decimal")?.value || ".";
  const next = { group, decimal };
  separatorsCache.set(locale, next);
  return next;
}

function countStepDecimals(step) {
  if (step == null) return 2;
  const s = String(step).trim();
  if (!s || s === "any") return 6;
  const dot = s.indexOf(".");
  if (dot === -1) return 0;
  return Math.max(0, s.length - dot - 1);
}

function parseFlexibleNumber(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return { value: null, empty: true };

  // Remove spaces and keep only digits/separators/sign.
  const cleaned = raw.replace(/\s+/g, "");
  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  let decimalSep = null;
  let thousandSep = null;

  if (hasDot && hasComma) {
    const lastDot = cleaned.lastIndexOf(".");
    const lastComma = cleaned.lastIndexOf(",");
    decimalSep = lastDot > lastComma ? "." : ",";
    thousandSep = decimalSep === "." ? "," : ".";
  } else if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    const count = (cleaned.match(new RegExp(`\\${sep}`, "g")) || []).length;
    if (count > 1) {
      thousandSep = sep;
    } else {
      const idx = cleaned.lastIndexOf(sep);
      const digitsAfter = cleaned.length - idx - 1;
      if (digitsAfter >= 1 && digitsAfter <= 2) {
        decimalSep = sep;
      } else {
        thousandSep = sep;
      }
    }
  }

  let normalized = cleaned;
  if (thousandSep) normalized = normalized.split(thousandSep).join("");
  if (decimalSep) normalized = normalized.replace(decimalSep, ".");
  if (!decimalSep) normalized = normalized.replace(/[.,]/g, "");

  // Keep a single leading minus.
  normalized = normalized.replace(/(?!^)-/g, "");
  normalized = normalized.replace(/[^0-9.-]/g, "");

  const value = Number(normalized);
  if (!Number.isFinite(value)) return { value: null, empty: false };
  return { value, empty: false };
}

export default function NumberInput({
  value,
  onChange,
  onBlur,
  onFocus,
  className,
  step,
  disabled,
  placeholder,
  title,
  name,
  id,
  inputMode,
  ...rest
}) {
  const decimals = useMemo(() => countStepDecimals(step), [step]);
  const locale = DEFAULT_LOCALE;
  const { decimal } = useMemo(() => getSeparators(locale), [locale]);

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        useGrouping: true,
        maximumFractionDigits: decimals,
      }),
    [locale, decimals]
  );

  const rawFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        useGrouping: false,
        maximumFractionDigits: decimals,
      }),
    [locale, decimals]
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const numericValue = Number(value);
  const hasValue = value !== "" && value != null && Number.isFinite(numericValue);

  useEffect(() => {
    if (editing) return;
    if (!hasValue) {
      setDraft("");
      return;
    }
    setDraft(formatter.format(numericValue));
  }, [editing, formatter, hasValue, numericValue]);

  const handleFocus = (event) => {
    setEditing(true);
    if (hasValue) {
      setDraft(rawFormatter.format(numericValue));
    } else {
      setDraft("");
    }
    onFocus?.(event);
  };

  const handleChange = (event) => {
    const next = event.target.value;
    setDraft(next);

    const parsed = parseFlexibleNumber(next);
    if (parsed.empty) {
      onChange?.("");
      return;
    }
    if (parsed.value == null) return;
    onChange?.(parsed.value);
  };

  const handleBlur = (event) => {
    setEditing(false);

    const parsed = parseFlexibleNumber(draft);
    if (parsed.empty) {
      setDraft("");
      onChange?.("");
      onBlur?.(event);
      return;
    }
    if (parsed.value != null) {
      const rounded = Number(parsed.value);
      setDraft(formatter.format(rounded));
      onChange?.(rounded);
    }
    onBlur?.(event);
  };

  return (
    <input
      {...rest}
      id={id}
      name={name}
      className={className}
      value={editing ? draft : draft || ""}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      placeholder={placeholder}
      title={title}
      inputMode={inputMode || "decimal"}
      autoComplete="off"
      aria-invalid={rest["aria-invalid"]}
      data-decimal-separator={decimal}
    />
  );
}
