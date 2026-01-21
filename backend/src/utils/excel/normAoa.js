// backend/src/utils/excel/normAoa.js
// Build AOA (array-of-arrays) representation for Norm (N.Kadro) Excel sheets.

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function roundMaybe(v, decimals) {
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    const p = Math.pow(10, decimals);
    return Math.round(n * p) / p;
}

function spreadSegmentTotals(visibleGrades, segments, segmentTotals) {
    const out = visibleGrades.map(() => "");
    const indexByGrade = new Map(visibleGrades.map((g, i) => [g, i]));
    (segments || []).forEach((seg, segIdx) => {
        const first = seg?.grades?.[0];
        const col = indexByGrade.get(first);
        if (Number.isInteger(col)) out[col] = num(segmentTotals?.[segIdx]);
    });
    return out;
}

function buildNormAoa({ model, sheetTitle }) {
    const title = String(sheetTitle || "N.Kadro").trim() || "N.Kadro";
    const aoa = [];

    if (!model || typeof model !== "object") {
        aoa.push([title]);
        aoa.push([]);
        aoa.push(["Norm model empty"]);
        return aoa;
    }

    const grades = Array.isArray(model.visibleGrades) ? model.visibleGrades : [];
    const segments = Array.isArray(model.segments) ? model.segments : [];

    // Title
    aoa.push([title]);
    aoa.push([]);

    // --- Summary / KPIs ---
    const s = model.summary || {};
    aoa.push(["Özet"]);
    aoa.push(["Kalem", "Değer"]);
    aoa.push(["Toplam Ders Saati (Haftalık)", num(s.totalTeachingHours)]);
    aoa.push(["Toplam Eğitimci (Genel)", num(s.requiredTeachersOverall)]);
    aoa.push(["Okul Öncesi (KG) Yardımcı Sınıf Öğrt. (Sınıf Sayısı)", num(s.kgBranches)]);
    aoa.push(["Okul Öncesi Personeli (50 öğrenci / 1)", num(s.okulOncesiPersonel50)]);
    aoa.push(["Toplam Eğitimci (Genel + Okul Öncesi)", num(s.totalEducatorsWithOkulOncesi)]);
    aoa.push([
        "Öğrenci / Öğretmen",
        s.studentTeacherRatio == null ? "" : roundMaybe(s.studentTeacherRatio, 2),
    ]);
    aoa.push([
        "Öğretmen / Sınıf",
        s.teacherClassRatio == null ? "" : roundMaybe(s.teacherClassRatio, 2),
    ]);
    aoa.push([
        "Öğrenci / Sınıf",
        s.studentClassRatio == null ? "" : roundMaybe(s.studentClassRatio, 2),
    ]);
    aoa.push(["Eğitimci (Branşa Göre Toplam)", num(s.requiredTeachersByBranch)]);
    aoa.push([
        "Not",
        "Okul öncesi personeli hesaplaması: KG öğrenci sayısına göre 50 öğrenciye 1 personel.",
    ]);

    aoa.push([]);

    // --- Teacher summary table ---
    aoa.push(["Branş Bazlı (Toplam Ders Saati)"]);
    aoa.push(["Branş Öğretmeni", "Toplam Ders Saati", "Limit", "FTE", "Eğitimci"]);
    const limit = num(model?.meta?.teacherWeeklyMaxHours);
    (s.teacherRows || []).forEach((r) => {
        aoa.push([
            String(r.teacher || ""),
            num(r.hours),
            limit,
            roundMaybe(r.fte, 2),
            num(r.needed),
        ]);
    });

    aoa.push([]);

    // --- Planning grades table ---
    const plan = model.planning || {};
    aoa.push(["PLANLANAN DÖNEM BİLGİLERİ"]);
    aoa.push(["", ...grades, "TOPLAM"]);
    aoa.push([
        "Şube Sayısı",
        ...grades.map((g) => num(plan.branchByGrade?.[g])),
        num(plan.totals?.totalBranches),
    ]);
    aoa.push([
        "Öğrenci",
        ...grades.map((g) => num(plan.studentsByGrade?.[g])),
        num(plan.totals?.totalStudents),
    ]);
    aoa.push([
        "Kademe Toplamı",
        ...spreadSegmentTotals(grades, segments, plan.segmentTotals),
        num(plan.totals?.totalStudents),
    ]);

    aoa.push([]);

    // --- Current grades table ---
    const cur = model.current || {};
    aoa.push(["MEVCUT DÖNEM BİLGİLERİ"]);
    aoa.push(["", ...grades, "TOPLAM"]);
    // We only have per-grade values inside cur.rows; build quick maps
    const curBranchByGrade = {};
    const curStudentsByGrade = {};
    (cur.rows || []).forEach((r) => {
        curBranchByGrade[String(r.grade)] = num(r.branchCount);
        curStudentsByGrade[String(r.grade)] = num(r.studentsPerBranch);
    });
    aoa.push([
        "Şube Sayısı",
        ...grades.map((g) => num(curBranchByGrade[g])),
        num(cur.totals?.totalBranches),
    ]);
    aoa.push([
        "Öğrenci",
        ...grades.map((g) => num(curStudentsByGrade[g])),
        num(cur.totals?.totalStudents),
    ]);
    aoa.push([
        "Kademe Toplamı",
        ...spreadSegmentTotals(grades, segments, cur.segmentTotals),
        num(cur.totals?.totalStudents),
    ]);

    aoa.push([]);

    // --- Curriculum weekly hours table ---
    const curr = model.curriculum || {};
    aoa.push(["Ders Dağılımı (Haftalık)"]);
    aoa.push(["Branş Öğretmeni", "Ders Adı", ...grades, "Toplam Ders Saati"]);
    // Branch-count row (second header line in UI)
    aoa.push(["", "Planlanan Şube", ...grades.map((g) => num(plan.branchByGrade?.[g])), ""]);

    (curr.rows || []).forEach((r) => {
        const line = [String(r.teacher || ""), String(r.lesson || "")];
        grades.forEach((g) => line.push(num(curr.curriculumWeeklyHours?.[g]?.[r.key])));
        line.push(num(curr.rowTotals?.[r.key]));
        aoa.push(line);
    });

    // Totals row
    const totalsRow = ["TOPLAM", ""];
    grades.forEach((g) => totalsRow.push(num(curr.gradeClassHourTotals?.[g])));
    totalsRow.push(num(s.totalTeachingHours));
    aoa.push(totalsRow);

    return aoa;
}

module.exports = { buildNormAoa };
