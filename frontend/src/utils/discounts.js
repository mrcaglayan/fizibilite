const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function computeDiscountTotalForYear({
  yearKey,
  discounts,
  grossTuition,
  tuitionStudents,
  avgTuitionFee,
  factor,
}) {
  const students = toNum(tuitionStudents);
  const gross = toNum(grossTuition);
  const tuition = toNum(avgTuitionFee);
  if (gross <= 0 || students <= 0) return 0;

  // pick helpers WITHOUT cascading fallbacks across years
  const pick = (d, baseKey, yk) => {
    if (!d) return undefined;
    if (yk === "y2") return d?.[baseKey + "Y2"];
    if (yk === "y3") return d?.[baseKey + "Y3"];
    return d?.[baseKey];
  };

  const hasYearSpecific = (d, baseKey, yk) => {
    if (!d) return false;
    if (yk === "y2") return d?.[baseKey + "Y2"] != null && d?.[baseKey + "Y2"] !== "";
    if (yk === "y3") return d?.[baseKey + "Y3"] != null && d?.[baseKey + "Y3"] !== "";
    return d?.[baseKey] != null && d?.[baseKey] !== "";
  };

  const pickCount = (d, yk) => {
    if (!d) return null;
    if (yk === "y2") return d?.studentCountY2;
    if (yk === "y3") return d?.studentCountY3;
    return d?.studentCount;
  };

  let avgRate = 0;

  for (const d of discounts || []) {
    if (!d) continue;

    const mode = String(d.mode || "percent");

    const scRaw = pickCount(d, yearKey);
    const sc = scRaw == null || scRaw === "" ? null : Math.max(0, Math.round(toNum(scRaw)));
    const ratioFromCount = sc != null && students > 0 ? clamp(sc / students, 0, 1) : null;
    const ratio = ratioFromCount != null ? ratioFromCount : clamp(toNum(pick(d, "ratio", yearKey)), 0, 1);

    const rawValue = pick(d, "value", yearKey);
    const value = toNum(rawValue);

    if (mode === "fixed") {
      const perStudent = hasYearSpecific(d, "value", yearKey)
        ? Math.max(0, value)
        : Math.max(0, value) * (factor ?? 1);
      if (tuition > 0) avgRate += (ratio * perStudent) / tuition;
    } else {
      const pct = clamp(value, 0, 1);
      avgRate += ratio * pct;
    }
  }

  const capped = clamp(avgRate, 0, 1);
  const total = gross * capped;
  return Math.min(total, gross);
}
