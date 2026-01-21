// backend/src/utils/excel/raporAoa.js
//
// Sheet #1: "Rapor" (DetaylÄ± Rapor) => AOA builder
// AOA ONLY. No templates. No merges. No styling.

function isFiniteNumber(v) {
    const n = Number(v);
    return Number.isFinite(n);
}

function safeStr(v) {
    if (v == null) return "";
    return String(v);
}

function safeNumOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function buildRaporAoa({ model, reportCurrency = "usd", currencyMeta } = {}) {
    const aoa = [];

    if (!model || typeof model !== "object") {
        return [["Rapor model empty"]];
    }

    const inputCurrency = String(currencyMeta?.input_currency || "USD").toUpperCase();
    const fx = Number(currencyMeta?.fx_usd_to_local || 0);
    const localCode = safeStr(currencyMeta?.local_currency_code || "LOCAL");
    const showLocal = reportCurrency === "local" && inputCurrency === "LOCAL" && Number.isFinite(fx) && fx > 0;

    const money = (v) => {
        const n = safeNumOrNull(v);
        if (n == null) return null;
        return showLocal ? n * fx : n;
    };

    const currencyLabel = showLocal ? localCode : "USD";
    // Helper to push blank row
    const pushBlank = (count) => {
        const n = Math.max(0, Math.floor(Number(count) || 0));
        for (let i = 0; i < n; i++) aoa.push([]);
    }


    const pushTitle = (title) => {
        if (title) aoa.push([safeStr(title)]);
    };
    const pushTable = (headers, rows) => {
        if (Array.isArray(headers) && headers.length) aoa.push(headers.map(safeStr));
        if (Array.isArray(rows)) {
            for (const r of rows) aoa.push(Array.isArray(r) ? r : [r]);
        }
    };

    pushBlank(2); // align header to row 80 (merged/styled in scenarios.js)
    aoa.push([null, null, null, null, null, null, null, null, null, safeStr(model.countryName)]);
    pushBlank(24);
    aoa.push([null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, safeStr(model.schoolName).toUpperCase()]);
    pushBlank(3);
    aoa.push([null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, safeStr(model.principalName).toUpperCase()]);
    pushBlank(3);
    aoa.push([null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, safeStr(model.temsilciName).toUpperCase()]);
    pushBlank(3);
    aoa.push([null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, safeStr(model.reporterName).toUpperCase()]);



    // A. OKUL EĞİTİM BİLGİLERİ°
    // aoa.push(["", "A. OKUL EÄžÄ°TÄ°M BÄ°LGÄ°LERÄ°"]);
    while (aoa.length < 58) aoa.push([]);
    aoa.push([null, "A. OKUL EĞİTİM BİLGİLERİ"]);
    pushBlank(2);
    pushTable([], [
        [null, "Eğitim Öğretim Döneminin Başlama Tarihi", null, null, null, null, null, null, null, null, null, null, null, null, null, safeStr(model.periodStartDate)],
        [null, "Okul Kapasitesi)", null, null, null, null, null, null, null, null, null, null, null, null, null, safeNumOrNull(model.schoolCapacity) ?? safeStr(model.schoolCapacity)],
        [null, "Mevcut Öğrenci Sayısı", null, null, null, null, null, null, null, null, null, null, null, null, null, safeNumOrNull(model.currentStudents) ?? safeStr(model.currentStudents)],
        [null, "Zorunlu Eğitim Dönemleri", null, null, null, null, null, null, null, null, null, null, null, null, null, safeStr(model.compulsoryEducation)],
        [null, "Bir Ders Süresi", null, null, null, null, null, null, null, null, null, null, null, null, null, safeNumOrNull(model.lessonDuration) ?? safeStr(model.lessonDuration)],
        [null, "Günlük Ders Saati", null, null, null, null, null, null, null, null, null, null, null, null, null, safeNumOrNull(model.dailyLessonHours) ?? safeStr(model.dailyLessonHours)],
        [null, "Haftalık Ders Saati Toplamı (Bir Sınıfın) ", null, null, null, null, null, null, null, null, null, null, null, null, null, safeNumOrNull(model.weeklyLessonHours) ?? safeStr(model.weeklyLessonHours)],
        [null, "Okulda Sabahçı / Öğlenci Uygulaması", null, null, null, null, null, null, null, null, null, null, null, null, null, safeStr(model.shiftSystem)],
        [null, "Öğretmen Haftalık Ders Saati Ortalaması", null, null, null, null, null, null, null, null, null, null, null, null, null, safeNumOrNull(model.teacherWeeklyHoursAvg) ?? safeStr(model.teacherWeeklyHoursAvg)],
        [null, "Fiili Derslik Kullanım Yüzdeliği", null, null, null, null, null, null, null, null, null, null, null, null, null, safeNumOrNull(model.classroomUtilization) ?? safeStr(model.classroomUtilization)],
        [null, "Geçiş Sınavı Bilgisi", null, null, null, null, null, null, null, null, null, null, null, null, null, safeStr(model.transitionExamInfo)],
        [null, "Program Türü", null, null, null, null, null, null, null, null, null, null, null, null, null, safeStr(model.programType)],
    ]);
    pushBlank(3);

    // B. OKUL ÜCRETLERİ TABLOSU
    while (aoa.length < 76) aoa.push([]); // rows are 1-based; 76 blanks means next is row 77
    aoa.push([null, "B. OKUL ÜCRETLERİ TABLOSU (YENİ EĞİTİM DÖNEMİ)"]);
    pushBlank(2); // align header to row 80 (merged/styled in scenarios.js)
    const tuitionHeaderRow = Array(22).fill(null);
    tuitionHeaderRow[1] = "Kademe";                                  // B
    tuitionHeaderRow[8] = `Eğitim Ücreti (${currencyLabel})`;       // I
    tuitionHeaderRow[10] = `Üniforma (${currencyLabel})`;            // K
    tuitionHeaderRow[12] = `Kitap KKirtasiye (${currencyLabel})`;     // M
    tuitionHeaderRow[14] = `Ulaşılmaz (${currencyLabel})`;             // O
    tuitionHeaderRow[16] = `Yemek (${currencyLabel})`;                // Q
    tuitionHeaderRow[18] = "Artış Yüzdesi";                          // S
    tuitionHeaderRow[20] = `Total Ücret (${currencyLabel})`;         // U
    aoa.push(tuitionHeaderRow);

    const tuitionRows = Array.isArray(model.tuitionTable)
        ? model.tuitionTable.map((r) => {
            const row = Array(22).fill(null);
            row[1] = safeStr(r?.level || r?.kademe || "");
            row[8] = money(r?.edu);
            row[10] = money(r?.uniform);
            row[12] = money(r?.books);
            row[14] = money(r?.transport);
            row[16] = money(r?.meal);
            row[18] = safeNumOrNull(r?.raisePct) ?? safeStr(r?.raisePct);
            row[20] = money(r?.total);
            return row;
        })
        : [];
    tuitionRows.forEach((r) => aoa.push(r));
    pushBlank(1);

    // C. PARAMETRELER
    pushTitle("C. OKUL ÜCRETİ HESAPLAMA PARAMETRELERİ");
    const paramHeaders = ["No", "Parametre", "Veri"];
    const paramRows = Array.isArray(model.parameters)
        ? model.parameters.map((p) => {
            const valueType = String(p?.valueType || "").toLowerCase();
            let v = p?.value;
            if (valueType === "currency") v = money(v);
            else if (valueType === "percent") v = safeNumOrNull(v) ?? safeStr(v);
            else v = safeNumOrNull(v) ?? safeStr(v);
            return [safeStr(p?.no), safeStr(p?.desc), v];
        })
        : [];
    pushTable(paramHeaders, paramRows);

    // C.1 Kapasite
    pushBlank(1);
    pushTitle("C.1 KAPASİTE KULLANIMI");
    pushBlank(1);

    const cap = model.capacity || {};
    const pushDualRow = (leftLabel, leftVal, rightLabel, rightVal) => {
        const row = Array(22).fill(null);
        row[1] = leftLabel ?? null;
        row[9] = leftVal ?? null;
        row[14] = rightLabel ?? null;
        row[19] = rightVal ?? null;
        aoa.push(row);
    };

    pushDualRow("Öğrenci Kapasite Bilgileri", null, "Sınıf Kapasite Bilgileri", null);

    const leftRows = [
        ["Bina Kapasitesi", safeNumOrNull(cap.buildingCapacity) ?? safeStr(cap.buildingCapacity)],
        ["Mevcut Öğrenci Sayısı", safeNumOrNull(cap.currentStudents) ?? safeStr(cap.currentStudents)],
        ["Planlanan Öğrenci Sayısı", safeNumOrNull(cap.plannedStudents) ?? safeStr(cap.plannedStudents)],
        ["Kapasite Kullanım Yüzdeliği", safeNumOrNull(cap.plannedUtilization) ?? safeStr(cap.plannedUtilization)],
        [null, null],
    ];
    const rightRows = [
        ["Kapasiteye Uygun Derslik Sayısı", safeNumOrNull(cap.plannedBranches) ?? safeStr(cap.plannedBranches)],
        ["Mevcut Derslik Sayısı", safeNumOrNull(cap.totalBranches) ?? safeStr(cap.totalBranches)],
        ["Kullanılan Derslik Sayısı", safeNumOrNull(cap.usedBranches) ?? safeStr(cap.usedBranches)],
        ["Sınıf Doluluk Oranı", safeNumOrNull(cap.avgStudentsPerClass) ?? safeStr(cap.avgStudentsPerClass)],
        ["Sınıf Doluluk Oranı (Planlanan)", safeNumOrNull(cap.avgStudentsPerClassPlanned) ?? safeStr(cap.avgStudentsPerClassPlanned)],
    ];

    for (let i = 0; i < 5; i += 1) {
        const [leftLabel, leftVal] = leftRows[i] || [null, null];
        const [rightLabel, rightVal] = rightRows[i] || [null, null];
        pushDualRow(leftLabel, leftVal, rightLabel, rightVal);
    }

    // C.2 HR
    pushBlank(1);
    pushTitle("C.2. INSAN KAYNAKLARI ( PLANLAMA TABLOSU VERILERI)");
    const hrHeaderRow = Array(22).fill(null);
    hrHeaderRow[14] = "Mevcut";
    hrHeaderRow[18] = "Planlanan";
    aoa.push(hrHeaderRow);

    const hrRows = Array.isArray(model.hr)
        ? model.hr.map((r) => {
            const row = Array(22).fill(null);
            row[1] = safeStr(r?.item || r?.name || "");
            row[14] = safeNumOrNull(r?.current) ?? safeStr(r?.current);
            row[18] = safeNumOrNull(r?.planned) ?? safeStr(r?.planned);
            return row;
        })
        : [];
    hrRows.forEach((r) => aoa.push(r));

    const hrNoteRow = Array(22).fill(null);
    hrNoteRow[1] =
        "*Ideal bir okul isletmesinde egitimci personel basina dusen ogrenci sayisi 10-12 olmalidir.";
    aoa.push(hrNoteRow);

    // C.3 Gelirler
    pushBlank(1);
    pushTitle("C.3. GELIRLER ( PLANLAMA EXCEL TABLOSU VERILERI)");
    const revenueRows = Array.isArray(model.revenues) ? model.revenues : [];
    const revenueTotalFromRows = revenueRows.reduce(
        (sum, r) => sum + (Number.isFinite(r?.amount) ? Number(r.amount) : 0),
        0
    );
    const revenueTotalFromModel = Number(model?.revenueTotal ?? model?.revenuesDetailedTotal);
    const revenueTotalAmount =
        Number.isFinite(revenueTotalFromModel) && revenueTotalFromModel > 0
            ? revenueTotalFromModel
            : revenueTotalFromRows;
    const revenueTotalRatio = revenueTotalAmount > 0 ? 1 : 0;
    const revenueHeaderRow = Array(22).fill(null);
    revenueHeaderRow[1] = "Gelirler";
    revenueHeaderRow[14] = "Tutar";
    revenueHeaderRow[20] = "% Orani";
    aoa.push(revenueHeaderRow);

    const revenueTableRows = revenueRows.map((r) => {
        const row = Array(22).fill(null);
        row[1] = safeStr(r?.name || "");
        row[14] = money(r?.amount);
        row[20] = safeNumOrNull(r?.ratio) ?? safeStr(r?.ratio);
        return row;
    });
    revenueTableRows.forEach((r) => aoa.push(r));

    const revenueTotalRow = Array(22).fill(null);
    revenueTotalRow[1] = "Toplam";
    revenueTotalRow[14] = money(revenueTotalAmount);
    revenueTotalRow[20] = revenueTotalRatio;
    aoa.push(revenueTotalRow);

    const revenueNoteRow = Array(22).fill(null);
    revenueNoteRow[1] =
        "*Uniforma, kitap kirtasiye, yemek, servis gibi hizmetler gider olarak yazilmalidir ve en az %10-30 araliginda kar konulmalidir.";
    aoa.push(revenueNoteRow);

    // C.4 Giderler
    pushBlank(1);
    pushTitle("C.4. GIDERLER ( PLANLAMA EXCEL TABLOSU VERILERI)");
    const detailedExpenseRows = Array.isArray(model?.parametersMeta?.detailedExpenses)
        ? model.parametersMeta.detailedExpenses
        : null;
    const expenseRows = detailedExpenseRows
        ? detailedExpenseRows
        : Array.isArray(model.expenses)
            ? model.expenses
            : [];
    const expenseTotalFromRows = expenseRows.reduce(
        (sum, r) => sum + (Number.isFinite(r?.amount) ? Number(r.amount) : 0),
        0
    );
    const expenseTotalFromModel = Number(
        model?.parametersMeta?.detailedExpenseTotal ?? model?.expenseTotal
    );
    const expenseTotalAmount =
        Number.isFinite(expenseTotalFromModel) && expenseTotalFromModel > 0
            ? expenseTotalFromModel
            : expenseTotalFromRows;
    const expenseTotalRatio = expenseTotalAmount > 0 ? 1 : 0;
    const expenseHeaderRow = Array(22).fill(null);
    expenseHeaderRow[1] = "Giderler";
    expenseHeaderRow[14] = "Tutar";
    expenseHeaderRow[20] = "% Orani";
    aoa.push(expenseHeaderRow);

    const expenseTableRows = expenseRows.map((r) => {
        const row = Array(22).fill(null);
        row[1] = safeStr(r?.name || "");
        row[14] = money(r?.amount);
        row[20] = safeNumOrNull(r?.ratio) ?? safeStr(r?.ratio);
        return row;
    });
    expenseTableRows.forEach((r) => aoa.push(r));

    const expenseTotalRow = Array(22).fill(null);
    expenseTotalRow[1] = "Toplam";
    expenseTotalRow[14] = money(expenseTotalAmount);
    expenseTotalRow[20] = expenseTotalRatio;
    aoa.push(expenseTotalRow);

    // C.5 Tahsil Edilemeyecek Gelirler
    pushBlank(1);
    pushTitle("C.5. TAHSIL EDILEMEYECEK GELIRLER");
    aoa.push([
        "Onceki yillarda tahsil edilemeyen giderlerin hesaplanmasi suretiyle ogrenci basi ortalama bir gider okul fiyatlarina eklenmelidir.",
    ]);

    // C.6 Giderlerin Sapma Yuzdeligi
    pushBlank(1);
    pushTitle("C.6. GIDERLERIN SAPMA YUZDELIGI (%... OLARAK HESAPLANABILIR)");
    aoa.push([
        "Hedeflenen ogrenci sayisina uygun olarak hesaplanan isletme, burs, erken kayit ve kampanya giderlerinin toplamindan sonra yanilma payi olarak belli bir yuzdelik belirlenerek cikan ortalama ogrenci fiyatina eklenmelidir.",
    ]);

    // C.7 Burs ve Indirimler
    pushBlank(1);
    pushTitle("C.7. BURS VE INDIRIM ORANLARI ( BURS VE INDIRIMLER GENELGESI)");

    const scholarshipsRows = Array.isArray(model.scholarships) ? model.scholarships : [];
    const discountsRows = Array.isArray(model.discounts) ? model.discounts : [];
    const analysisMeta = model?.parametersMeta?.discountAnalysis || model?.discountAnalysis || {};
    const scholarshipAnalysis = analysisMeta?.scholarships || {};
    const discountAnalysis = analysisMeta?.discounts || {};

    const sumCount = (rows, key) =>
        rows.reduce((sum, r) => (Number.isFinite(Number(r?.[key])) ? sum + Number(r[key]) : sum), 0);
    const sumCost = (rows) =>
        rows.reduce((sum, r) => (Number.isFinite(Number(r?.cost)) ? sum + Number(r.cost) : sum), 0);

    const buildGroupHeaderRow = (label) => {
        const row = Array(22).fill(null);
        row[1] = label;
        row[14] = "MEVCUT DONEM";
        row[17] = "PLANLANAN DONEM";
        return row;
    };

    const buildSubHeaderRow = () => {
        const row = Array(22).fill(null);
        row[14] = "Ogrenci Sayisi";
        row[17] = "Ogrenci Sayisi";
        row[19] = "Maliyet";
        return row;
    };

    const buildDataRow = (r) => {
        const row = Array(22).fill(null);
        row[1] = safeStr(r?.name || "");
        row[14] = safeNumOrNull(r?.cur) ?? safeStr(r?.cur);
        row[17] = safeNumOrNull(r?.planned) ?? safeStr(r?.planned);
        row[19] = money(r?.cost);
        return row;
    };

    const buildTotalRow = (rows) => {
        const row = Array(22).fill(null);
        row[1] = "Toplam";
        row[14] = sumCount(rows, "cur");
        row[17] = sumCount(rows, "planned");
        row[19] = money(sumCost(rows));
        return row;
    };

    const pushAnalysisRows = (labelPrefix, analysis) => {
        const rows = [
            {
                label: `Toplam ${labelPrefix} Hedeflenen Ogrenci Sayisina Bolumu`,
                value: money(analysis?.perTargetStudent),
            },
            {
                label: `${labelPrefix} Ogrencilerin Toplam Ogrenci icindeki %`,
                value: safeNumOrNull(analysis?.studentShare) ?? safeStr(analysis?.studentShare),
            },
            {
                label: `${labelPrefix} Velilerden Alinan Ogrenci Gelirleri icindeki %`,
                value: safeNumOrNull(analysis?.revenueShare) ?? safeStr(analysis?.revenueShare),
            },
            {
                label: `Agirlikli ${labelPrefix} Ortalamasi %`,
                value: safeNumOrNull(analysis?.weightedAvgRate) ?? safeStr(analysis?.weightedAvgRate),
            },
        ];
        rows.forEach((item) => {
            const row = Array(22).fill(null);
            row[1] = item.label;
            row[20] = item.value;
            aoa.push(row);
        });
    };

    // Burslar
    aoa.push(buildGroupHeaderRow("Burslar"));
    aoa.push(buildSubHeaderRow());
    scholarshipsRows.forEach((r) => aoa.push(buildDataRow(r)));
    aoa.push(buildTotalRow(scholarshipsRows));
    pushBlank(1);
    pushAnalysisRows("Burs", scholarshipAnalysis);
    pushBlank(1);

    // Indirimler
    aoa.push(buildGroupHeaderRow("Indirimler"));
    aoa.push(buildSubHeaderRow());
    discountsRows.forEach((r) => aoa.push(buildDataRow(r)));
    aoa.push(buildTotalRow(discountsRows));
    pushBlank(1);
    pushAnalysisRows("Indirim", discountAnalysis);
    pushBlank(1);

    // C.8 Rakip Kurumlarin Analizi
    pushBlank(1);
    pushTitle("C.8. RAKIP KURUMLARIN ANALIZI ( PLANLAMA EXCELL TABLOSU VERILERI)");
    aoa.push([
        "Esdeger kurumlarla yarisabilecek egitim kalitesine ve ekonomik guce sahip olmak icin okul ucretinin rakip kurumlar ile yarisabilecek yeterlilikte olmasi gereklidir.",
    ]);
    pushBlank(1);

    const competitorHeaderRow = Array(22).fill(null);
    competitorHeaderRow[8] = "A Kurum Fiyati";
    competitorHeaderRow[13] = "B Kurum Fiyati";
    competitorHeaderRow[18] = "C Kurum Fiyati";
    aoa.push(competitorHeaderRow);

    const competitorRows = Array.isArray(model.competitors) ? model.competitors : [];
    competitorRows.forEach((r) => {
        const row = Array(22).fill(null);
        row[1] = safeStr(r?.level || "");
        row[8] = money(r?.a);
        row[13] = money(r?.b);
        row[18] = money(r?.c);
        aoa.push(row);
    });

    // C.9 Yerel Mevzuatta Uygunluk
    pushBlank(1);
    pushTitle("C.9. YEREL MEVZUATTA UYGUNLUK (YASAL AZAMI ARTIS)");
    aoa.push([
        "Belirlenecek ucretin ulke mevzuatina uygun olmasi, ulkede belirlenen azami ucret artislarinin son uc yilin resmi enflasyon orani gibi parametreler dikkatte alinmalidir. Ayrica ev sahibi ulke ile yapilmis Protokol yukumlulukleri de mutlaka dikkate alinmalidir.",
    ]);

    // C.10 Mevcut Egitim Sezonu Ucreti
    pushBlank(1);
    pushTitle("C.10. MEVCUT EGITIM SEZONU UCRETI");
    aoa.push([
        "Belirlenecek ucretin mevcut egitim donemi ile uyumlu olmasina azami onem gosterilmeli ve surdurulebilir devamlilik ilkesi gozetilmelidir.",
    ]);
    aoa.push(["Bu Sayfa Komisyon Uyeleri Tarafindan Doldurulacaktir."]);
    // D. PERFORMANS
    pushBlank(1);
    pushTitle("D. GERCEKLESEN VE GERCEKLESMESI PLANLANAN /PERFORMANS");
    const perfRows = Array.isArray(model.performance) ? model.performance : [];
    const yearRaw = model?.academicStartYear ?? model?.academicYear ?? model?.academic_year;
    const yearNum = Number(yearRaw);
    const periodLabel = Number.isFinite(yearNum) ? `${yearNum}-${yearNum + 1}` : safeStr(yearRaw || "");
    const periodPrefix = periodLabel ? `${periodLabel} Donemi` : "Donem";
    const perfHeaderRow = Array(22).fill(null);
    perfHeaderRow[6] = `${periodPrefix} Planlanan`;
    perfHeaderRow[12] = `${periodPrefix} Gerceklesen`;
    perfHeaderRow[18] = "Sapma Yuzdesi";
    aoa.push(perfHeaderRow);
    console.log("perfRows:", perfRows);

    perfRows.forEach((r) => {
        const label = safeStr(r?.metric || "");
        const labelLower = label.toLowerCase();
        const isStudentRow = labelLower.includes("ogrenci");
        const plannedValue = isStudentRow
            ? safeNumOrNull(r?.planned) ?? safeStr(r?.planned)
            : r?.planned != null && isFiniteNumber(r.planned)
                ? money(r.planned)
                : safeNumOrNull(r?.planned) ?? safeStr(r?.planned);
        const actualValue = isStudentRow
            ? safeNumOrNull(r?.actual) ?? safeStr(r?.actual)
            : r?.actual != null && isFiniteNumber(r.actual)
                ? money(r.actual)
                : safeNumOrNull(r?.actual) ?? safeStr(r?.actual);
        const varianceValue = safeNumOrNull(r?.variance) ?? safeStr(r?.variance);
        const row = Array(22).fill(null);
        row[1] = label;
        row[6] = plannedValue;
        row[12] = actualValue;
        row[18] = varianceValue;
        aoa.push(row);
    });

    // E. DEGERLENDIRME
    pushBlank(1);
    pushTitle("E. DEGERLENDIRME");
    aoa.push([
        "Okulun lokasyon, fiziki sartlari, varsa karsilasilan zorluklar, bolgenin demografik yapisi, sosyal ekonomik durumu, enflasyon, belirtmek istediginiz hususlar, oneriler kisaca bir paragraf yazabilirsiniz.",
    ]);

    // F. KOMISYON GORUS VE ONERILERI
    pushBlank(1);
    pushTitle("F. KOMISYON GORUS VE ONERILERI");
    pushBlank(1);
    return aoa;
}

module.exports = {
    buildRaporAoa,
};


