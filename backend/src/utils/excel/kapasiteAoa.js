// backend/src/utils/excel/kapasiteAoa.js
// Converts the Kapasite model to a plain AOA sheet.
// IMPORTANT: AOA only. No templates. No fallbacks.

function fmtMaybeNumber(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildHeaders(periods) {
  const curLabel = periods?.cur?.label || "Mevcut";
  const y1Label = periods?.y1?.label || "1. YIL";
  const y2Label = periods?.y2?.label || "2. YIL";
  const y3Label = periods?.y3?.label || "3. YIL";

  return [
    "Kademe",
    `${curLabel} Kapasite`,
    `${curLabel} Öğrenci Sayısı`,
    `${curLabel} Kapasite Kullanım Oranı (%)`,
    `${y1Label} Kapasite`,
    `${y1Label} Öğrenci Sayısı`,
    `${y1Label} Kapasite Kullanım Oranı (%)`,
    `${y2Label} Kapasite`,
    `${y2Label} Öğrenci Sayısı`,
    `${y2Label} Kapasite Kullanım Oranı (%)`,
    `${y3Label} Kapasite`,
    `${y3Label} Öğrenci Sayısı`,
    `${y3Label} Kapasite Kullanım Oranı (%)`,
  ];
}

function buildKapasiteAoa({ model }) {
  const m = model && typeof model === "object" ? model : {};
  const periods = m.periods && typeof m.periods === "object" ? m.periods : {};
  const rows = Array.isArray(m.rows) ? m.rows : [];

  const aoa = [];

  // Title row (requested)
  aoa.push(["Kapasite"]);

  // Header row
  aoa.push(buildHeaders(periods));

  for (const r of rows) {
    const kind = String(r?.kind || "");
    const label = String(r?.label || "");

    // Growth rows are special (values only per year, no cap/util)
    if (kind === "growthDelta") {
      const v = r?.values || {};
      const aoaRow = [
        label,
        null,
        null,
        null,
        null,
        fmtMaybeNumber(v?.y1),
        null,
        null,
        fmtMaybeNumber(v?.y2),
        null,
        null,
        fmtMaybeNumber(v?.y3),
        null,
      ];
      aoa.push(aoaRow);
      continue;
    }

    if (kind === "growthRate") {
      const v = r?.values || {};
      const aoaRow = [
        label,
        null,
        null,
        null,
        null,
        fmtMaybeNumber(v?.y1),
        null,
        null,
        fmtMaybeNumber(v?.y2),
        null,
        null,
        fmtMaybeNumber(v?.y3),
        null,
      ];
      aoa.push(aoaRow);
      continue;
    }

    // Kademe / Total rows
    const aoaRow = [label];

    const pCur = r?.periods?.cur || {};
    aoaRow.push(fmtMaybeNumber(pCur?.capacity));
    aoaRow.push(fmtMaybeNumber(pCur?.students));
    aoaRow.push(fmtMaybeNumber(pCur?.utilizationPct));

    const pY1 = r?.periods?.y1 || {};
    aoaRow.push(fmtMaybeNumber(pY1?.capacity));
    aoaRow.push(fmtMaybeNumber(pY1?.students));
    aoaRow.push(fmtMaybeNumber(pY1?.utilizationPct));

    const pY2 = r?.periods?.y2 || {};
    aoaRow.push(fmtMaybeNumber(pY2?.capacity));
    aoaRow.push(fmtMaybeNumber(pY2?.students));
    aoaRow.push(fmtMaybeNumber(pY2?.utilizationPct));

    const pY3 = r?.periods?.y3 || {};
    aoaRow.push(fmtMaybeNumber(pY3?.capacity));
    aoaRow.push(fmtMaybeNumber(pY3?.students));
    aoaRow.push(fmtMaybeNumber(pY3?.utilizationPct));

    aoa.push(aoaRow);
  }

  return aoa;
}

module.exports = { buildKapasiteAoa };
