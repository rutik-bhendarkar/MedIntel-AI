const {
    analyzeReport
} = require("../services/reportAnalyzer");

const {
    generateReportInsights
} = require("../services/geminiService");

const db = require("../config/db");

function getAuthenticatedUserId(req, res) {
    const userId = req.user?.id;

    if (!userId) {
        res.status(401).json({
            success: false,
            message: "Authentication token is required",
        });
        return null;
    }

    return userId;
}

function parseList(value) {
    if (!value) {
        return [];
    }

    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();

        if (!trimmed) {
            return [];
        }

        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed : [trimmed];
        } catch (error) {
            return trimmed
                .split(/\r?\n|;/)
                .map((item) => item.trim())
                .filter(Boolean);
        }
    }

    return [String(value)];
}

function safeJsonParse(value) {
    if (!value || typeof value !== "string") {
        return null;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
}

function normalizeLabKey(key) {
    const normalized = String(key || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    const map = {
        hgb: "hemoglobin",
        hb: "hemoglobin",
        hemoglobin: "hemoglobin",
        wbc: "wbc",
        "white blood cell": "wbc",
        "white blood cells": "wbc",
        platelet: "platelets",
        platelets: "platelets",
        "platelet count": "platelets",
        glucose: "glucose",
        "blood sugar": "glucose",
        sugar: "glucose",
        hba1c: "hba1c",
        "hb a1c": "hba1c",
        "glycated hemoglobin": "hba1c",
        cholesterol: "cholesterol",
        triglycerides: "triglycerides",
        triglyceride: "triglycerides",
        creatinine: "creatinine",
        alt: "alt",
        sgpt: "alt",
        ast: "ast",
        sgot: "ast",
        bilirubin: "bilirubin",
        urea: "urea",
        bun: "urea",
    };

    return map[normalized] || null;
}

function extractMedicalDataFromText(text) {
    const data = {};

    if (!text || typeof text !== "string") {
        return data;
    }

    const patterns = [
        /(?:^|[\n;,])\s*[-*]?\s*(hemoglobin|hgb|hb|wbc|white blood cells?|platelets?|platelet count|glucose|blood sugar|hba1c|hb a1c|cholesterol|triglycerides?|creatinine|alt|sgpt|ast|sgot|bilirubin|urea|bun)\s*[:=\-]?\s*([<>]?\d+(?:\.\d+)?)/gi,
    ];

    for (const regex of patterns) {
        let match;
        while ((match = regex.exec(text)) !== null) {
            const key = normalizeLabKey(match[1]);
            const value = Number(String(match[2]).replace(/[<>]/g, ""));

            if (key && Number.isFinite(value)) {
                data[key] = value;
            }
        }
    }

    return data;
}

function extractMedicalData(report) {
    const candidateSources = [
        report.extracted_data,
        report.lab_values,
        report.analysis_data,
        report.report_data,
        report.ocr_data,
        report.medical_data,
        report.values,
        report.extracted_text,
        report.findings,
        report.recommendations,
    ];

    const data = {};

    for (const source of candidateSources) {
        if (!source) continue;

        if (typeof source === "object" && !Array.isArray(source)) {
            for (const [key, value] of Object.entries(source)) {
                const normalizedKey = normalizeLabKey(key);
                const numericValue = Number(value);

                if (normalizedKey && Number.isFinite(numericValue)) {
                    data[normalizedKey] = numericValue;
                }
            }
            continue;
        }

        if (typeof source === "string") {
            const parsed = safeJsonParse(source);

            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                for (const [key, value] of Object.entries(parsed)) {
                    const normalizedKey = normalizeLabKey(key);
                    const numericValue = Number(value);

                    if (normalizedKey && Number.isFinite(numericValue)) {
                        data[normalizedKey] = numericValue;
                    }
                }
            } else {
                const textData = extractMedicalDataFromText(source);
                for (const [key, value] of Object.entries(textData)) {
                    data[key] = value;
                }
            }
        }
    }

    return data;
}

function buildMedicalSummary(medicalAnalysis) {
    if (!Array.isArray(medicalAnalysis) || medicalAnalysis.length === 0) {
        return "No analyzable lab values were stored for this report.";
    }

    const abnormal = medicalAnalysis.filter((item) => item.status !== "Normal");
    const normalCount = medicalAnalysis.length - abnormal.length;

    if (abnormal.length === 0) {
        return "All detected lab values are within the expected range.";
    }

    const abnormalSummary = abnormal
        .map(
            (item) =>
                `${item.test} is ${item.status.toLowerCase()} (${item.value} ${item.unit})`
        )
        .join("; ");

    return `${abnormalSummary}. ${normalCount > 0 ? `${normalCount} other value(s) are within range.` : ""}`.trim();
}

function normalizeRiskText(value) {
    const text = String(value || "Unknown").trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "Unknown";
}

function getReportCategory(reportType = "") {
    const text = String(reportType).toLowerCase();

    if (text.includes("diabetes") || text.includes("glucose") || text.includes("hba1c")) return "Diabetes / Metabolic";
    if (text.includes("heart") || text.includes("cardiac") || text.includes("lipid") || text.includes("cholesterol")) return "Heart / Lipid";
    if (text.includes("cbc") || text.includes("blood")) return "CBC";
    if (text.includes("liver") || text.includes("lft")) return "Liver";
    if (text.includes("kidney") || text.includes("renal") || text.includes("kft")) return "Kidney";

    return "General Health";
}

function getAbnormalValues(medicalAnalysis) {
    return medicalAnalysis.filter((item) => String(item.status).toLowerCase() !== "normal");
}

function getNormalValues(medicalAnalysis) {
    return medicalAnalysis.filter((item) => String(item.status).toLowerCase() === "normal");
}

function buildWarningSignals(riskLevel, abnormalValues, findings) {
    const risk = String(riskLevel || "").toLowerCase();
    const warnings = [];
    const findingText = findings.join(" ").toLowerCase();

    if (risk === "high") {
        warnings.push("High-risk report pattern detected. Arrange prompt medical review.");
    }

    abnormalValues.forEach((item) => {
        const label = `${item.test} ${item.status}`.toLowerCase();
        if (item.severity === "critical" || label.includes("glucose high") || label.includes("wbc high") || label.includes("creatinine high")) {
            warnings.push(`${item.test} is ${String(item.status).toLowerCase()}, which should be reviewed with a clinician.`);
        }
    });

    if (findingText.includes("chest") || findingText.includes("breath") || findingText.includes("critical")) {
        warnings.push("Seek urgent care if chest pain, breathing difficulty, fainting, confusion, or rapidly worsening symptoms are present.");
    }

    return [...new Set(warnings)];
}

function buildReportRecommendations({ reportType, riskLevel, findings, abnormalValues, medicalAnalysis }) {
    const risk = String(riskLevel || "").toLowerCase();
    const type = String(reportType || "").toLowerCase();
    const category = getReportCategory(reportType);
    const recommendations = [];

    const add = (text) => {
        if (text && !recommendations.includes(text)) {
            recommendations.push(text);
        }
    };

    if (risk === "high") {
        add("Book a doctor review urgently and share this report with the clinician, especially if symptoms are active or worsening.");
    } else if (risk === "medium") {
        add("Schedule a medical follow-up soon to review the abnormal markers and decide whether repeat testing is needed.");
    } else {
        add("Keep this report as a baseline and continue routine monitoring unless symptoms change.");
    }

    abnormalValues.forEach((item) => {
        const name = String(item.test || "").toLowerCase();
        const status = String(item.status || "").toLowerCase();

        if (name.includes("glucose") || name.includes("hba1c")) {
            add("Track fasting and post-meal glucose patterns, reduce high-sugar foods, and discuss diabetes screening or medication adjustment with your doctor.");
        } else if (name.includes("cholesterol") || name.includes("triglycerides")) {
            add("Prioritize heart-healthy meals, regular walking or aerobic activity, and ask about a lipid follow-up plan.");
        } else if (name.includes("hemoglobin") && status === "low") {
            add("Discuss anemia evaluation, iron/B12/folate testing, and diet support if fatigue, dizziness, or breathlessness is present.");
        } else if (name.includes("wbc")) {
            add("Review infection or inflammation symptoms such as fever, cough, pain, or urinary issues with a clinician.");
        } else if (name.includes("platelet")) {
            add("Avoid self-medicating with blood thinners or painkillers until platelet changes are reviewed professionally.");
        } else if (name.includes("creatinine") || name.includes("urea")) {
            add("Hydrate appropriately and review kidney function, blood pressure, and current medicines with a clinician.");
        } else if (["alt", "ast", "bilirubin"].some((key) => name.includes(key))) {
            add("Avoid alcohol and unnecessary over-the-counter medicines until liver markers are reviewed.");
        }
    });

    if (category === "Diabetes / Metabolic" || type.includes("diabetes")) {
        add("Bring recent diet, exercise, medication, and glucose logs to the next consultation.");
    }

    if (category === "Heart / Lipid" || type.includes("heart")) {
        add("Seek urgent care immediately if chest pain, sweating, shortness of breath, or fainting occurs.");
    }

    if (category === "CBC") {
        add("Compare CBC markers with symptoms like fever, weakness, bleeding, bruising, or recurrent infections.");
    }

    if (!abnormalValues.length && medicalAnalysis.length) {
        add("Detected lab values are within expected ranges; maintain healthy routines and repeat testing as advised by your doctor.");
    }

    if (!medicalAnalysis.length && findings.length) {
        add("Use the written findings as context and ask a clinician whether structured lab values or repeat testing are needed.");
    }

    add("Do not change prescribed medication based only on this AI interpretation.");

    return recommendations.slice(0, 8);
}

function buildPatientSummary(reportType, riskLevel, abnormalValues, normalValues) {
    const category = getReportCategory(reportType);
    const risk = normalizeRiskText(riskLevel);

    if (abnormalValues.length) {
        const abnormalText = abnormalValues
            .slice(0, 3)
            .map((item) => `${item.test} is ${String(item.status).toLowerCase()}`)
            .join(", ");
        return `This ${category.toLowerCase()} report is marked ${risk.toLowerCase()} risk because ${abnormalText}. Review these results with a qualified clinician and watch for symptoms.`;
    }

    if (normalValues.length) {
        return `The detected ${category.toLowerCase()} values are within expected ranges. Keep this report as a baseline and continue routine follow-up.`;
    }

    return `MedIntel AI could not extract structured lab values from this report, but the saved findings and risk level still provide context for a clinician review.`;
}

function buildDoctorSummary(reportType, riskLevel, abnormalValues, normalValues, findings) {
    const abnormalText = abnormalValues.length
        ? abnormalValues.map((item) => `${item.test}: ${item.value} ${item.unit} (${item.status}, ref ${item.normalRange || "-"})`).join("; ")
        : "No abnormal structured markers detected";
    const normalText = normalValues.length ? `${normalValues.length} structured marker(s) within range` : "No structured normal markers extracted";
    const findingText = findings.length ? findings.join("; ") : "No stored narrative findings";

    return `${getReportCategory(reportType)} report, ${normalizeRiskText(riskLevel)} risk. ${abnormalText}. ${normalText}. Narrative findings: ${findingText}.`;
}

function buildAiInterpretation(reportType, riskLevel, abnormalValues, normalValues, findings) {
    const category = getReportCategory(reportType);
    const warningTone = String(riskLevel || "").toLowerCase() === "high"
        ? "The overall pattern deserves prompt clinical attention."
        : "The pattern should be interpreted with symptoms, history, medications, and prior reports.";

    if (abnormalValues.length) {
        return `${category} interpretation: ${abnormalValues.length} marker(s) need attention while ${normalValues.length} marker(s) are within range. ${warningTone}`;
    }

    if (normalValues.length) {
        return `${category} interpretation: extracted values are currently within expected ranges. Continue routine monitoring and compare with prior results when available.`;
    }

    return `${category} interpretation: structured lab values were not available for automated range comparison. MedIntel AI used report type, saved findings, and risk level to produce cautious guidance.`;
}

function buildActionPlan(recommendations, warningSignals, riskLevel) {
    const actions = [];

    if (warningSignals.length || String(riskLevel || "").toLowerCase() === "high") {
        actions.push("Prioritize medical review before relying on home care alone.");
    }

    recommendations.slice(0, 3).forEach((item) => actions.push(item));

    if (!actions.length) {
        actions.push("Save this report, monitor symptoms, and repeat testing according to your clinician's advice.");
    }

    return [...new Set(actions)].slice(0, 5);
}

function estimateConfidence(medicalAnalysis, findings, reportType) {
    let score = 48;

    if (medicalAnalysis.length) score += Math.min(32, medicalAnalysis.length * 8);
    if (findings.length) score += Math.min(12, findings.length * 3);
    if (reportType && reportType !== "general") score += 8;

    return Math.max(35, Math.min(92, score));
}

function buildStructuredInterpretation(report, findings, recommendations, medicalAnalysis) {
    const reportType = report.report_type || "general";
    const riskLevel = report.risk_level || "Unknown";
    const abnormalValues = getAbnormalValues(medicalAnalysis);
    const normalValues = getNormalValues(medicalAnalysis);
    const generatedRecommendations = buildReportRecommendations({
        reportType,
        riskLevel,
        findings,
        abnormalValues,
        medicalAnalysis,
    });
    const mergedRecommendations = [...new Set([...generatedRecommendations, ...recommendations])].slice(0, 10);
    const warningSignals = buildWarningSignals(riskLevel, abnormalValues, findings);
    const patientSummary = buildPatientSummary(reportType, riskLevel, abnormalValues, normalValues);
    const doctorSummary = buildDoctorSummary(reportType, riskLevel, abnormalValues, normalValues, findings);
    const aiInterpretation = buildAiInterpretation(reportType, riskLevel, abnormalValues, normalValues, findings);
    const actionPlan = buildActionPlan(mergedRecommendations, warningSignals, riskLevel);

    return {
        reportName: report.report_name || `Report #${report.id || "-"}`,
        reportType,
        category: getReportCategory(reportType),
        riskLevel: normalizeRiskText(riskLevel),
        confidenceScore: estimateConfidence(medicalAnalysis, findings, reportType),
        abnormalValues,
        normalValues,
        recommendations: mergedRecommendations,
        warningSignals,
        patientSummary,
        doctorSummary,
        aiInterpretation,
        actionPlan,
        followUpSuggestions: actionPlan,
        trendInsight: "Trend comparison needs at least one prior structured report of the same type. Keep future uploads to unlock comparison.",
        topRecommendation: actionPlan[0] || "Review this report with a qualified clinician if symptoms are present.",
    };
}

async function enrichReport(report) {
    const findings = parseList(report.findings);
    const recommendations = parseList(report.recommendations);
    const reportType = report.report_type || "general";
    const riskLevel = report.risk_level || "Unknown";

    const extractedMedicalData = extractMedicalData(report);
    const medicalAnalysis = analyzeReport(extractedMedicalData);
    const medicalSummary = buildMedicalSummary(medicalAnalysis);
    const structuredInterpretation = buildStructuredInterpretation(report, findings, recommendations, medicalAnalysis);
    const aiMedicalInsights = medicalAnalysis.length
        ? await generateReportInsights(medicalAnalysis)
        : null;

    const parts = [
        `This saved ${reportType} report is marked as ${riskLevel} risk.`,
        `Findings: ${findings.length ? findings.join("; ") : "No findings stored"}.`,
        `Recommendations: ${structuredInterpretation.recommendations.length ? structuredInterpretation.recommendations.slice(0, 3).join("; ") : "No recommendations stored"}.`,
    ];

    if (medicalSummary) {
        parts.push(`Automated lab review: ${medicalSummary}`);
    }

    return {
        ...report,
        findings,
        recommendations: structuredInterpretation.recommendations,
        extractedMedicalData,
        medicalAnalysis,
        abnormalValues: structuredInterpretation.abnormalValues,
        normalValues: structuredInterpretation.normalValues,
        medicalSummary,
        aiMedicalInsights,
        structuredInterpretation,
        confidence_score: structuredInterpretation.confidenceScore,
        patient_summary: structuredInterpretation.patientSummary,
        doctor_summary: structuredInterpretation.doctorSummary,
        ai_interpretation: structuredInterpretation.aiInterpretation,
        warning_signals: structuredInterpretation.warningSignals,
        action_plan: structuredInterpretation.actionPlan,
        top_recommendation: structuredInterpretation.topRecommendation,
        trend_insight: structuredInterpretation.trendInsight,
        summary: structuredInterpretation.patientSummary || parts.join(" "),
        simplified_explanation: structuredInterpretation.patientSummary,
        disclaimer:
            "This MedIntel AI summary is for education only and is not a replacement for a qualified doctor.",
    };
}

// =====================================
// GET ALL REPORTS
// =====================================

exports.getAllReports = (req, res) => {
    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
        return;
    }

    const sql = `
        SELECT * FROM report_history
        WHERE user_id = ?
        ORDER BY uploaded_at DESC, id DESC
    `;

    db.query(sql, [userId], async (err, results) => {
        if (err) {
            console.log(err);
            return res.status(500).json({
                message: "Database Error",
            });
        }

        try {
            const reports = await Promise.all(results.map(enrichReport));

            return res.status(200).json({
                status: "success",
                total_reports: results.length,
                reports,
            });
        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Unable to enrich reports",
            });
        }
    });
};

// =====================================
// GET SINGLE REPORT
// =====================================

exports.getSingleReport = (req, res) => {
    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
        return;
    }

    const reportId = req.params.id;

    const sql = `
        SELECT * FROM report_history
        WHERE id = ?
          AND user_id = ?
    `;

    db.query(sql, [reportId, userId], async (err, results) => {
        if (err) {
            console.log(err);
            return res.status(500).json({
                message: "Database Error",
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                message: "Report Not Found",
            });
        }

        try {
            const report = await enrichReport(results[0]);

            return res.status(200).json({
                status: "success",
                report,
            });
        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Unable to enrich report",
            });
        }
    });
};

// =====================================
// DELETE REPORT
// =====================================

exports.deleteReport = (req, res) => {
    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
        return;
    }

    const reportId = req.params.id;

    const sql = `
        DELETE FROM report_history
        WHERE id = ?
          AND user_id = ?
    `;

    db.query(sql, [reportId, userId], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({
                message: "Database Error",
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Report Not Found",
            });
        }

        res.status(200).json({
            status: "success",
            message: "Report Deleted Successfully",
        });
    });
};

// =====================================
// SEARCH REPORTS BY TYPE
// =====================================

exports.searchReports = (req, res) => {
    const userId = getAuthenticatedUserId(req, res);

    if (!userId) {
        return;
    }

    const reportType = req.query.type;

    if (!reportType) {
        return res.status(400).json({
            message: "type query parameter is required",
        });
    }

    const sql = `
        SELECT * FROM report_history
        WHERE user_id = ?
          AND report_type LIKE ?
        ORDER BY uploaded_at DESC, id DESC
    `;

    db.query(sql, [userId, `%${reportType}%`], async (err, results) => {
        if (err) {
            console.log(err);
            return res.status(500).json({
                message: "Database Error",
            });
        }

        try {
            const reports = await Promise.all(results.map(enrichReport));

            return res.status(200).json({
                status: "success",
                total_results: results.length,
                reports,
            });
        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Unable to enrich reports",
            });
        }
    });
};
