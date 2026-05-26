const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const db = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const { generateSummaryPdf } = require("../utils/pdfGenerator");
const { analyzeReport } = require("../services/reportAnalyzer");

const {
    getAllReports,
    getSingleReport,
    deleteReport,
    searchReports
} = require("../controllers/reportController");

// =====================================================
// MULTER SETUP
// =====================================================

const uploadsDir = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}_${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowed = [".pdf", ".png", ".jpg", ".jpeg", ".txt"];
        const ext = path.extname(file.originalname).toLowerCase();

        if (allowed.includes(ext)) {
            cb(null, true);
            return;
        }

        cb(new Error("Only PDF, image, or TXT files are allowed"));
    }
});

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
            return trimmed.split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean);
        }
    }

    return [String(value)];
}

function sendPdf(res, summary, fileName = "ai-report-summary.pdf") {
    const pdf = generateSummaryPdf(summary);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdf);
}

function buildStoredReportSummary(report) {
    const findings = parseList(report.findings);
    const recommendations = parseList(report.recommendations);
    const reportType = report.report_type || "medical";
    const riskLevel = report.risk_level || "Unknown";
    const summary = `This saved ${reportType} report is marked as ${riskLevel} risk. Key findings: ${findings.length ? findings.join("; ") : "No findings stored"}. Suggested next steps: ${recommendations.length ? recommendations.join("; ") : "No recommendations stored"}.`;

    return {
        reportType,
        riskLevel,
        findings,
        recommendations,
        summary,
        fileName: report.report_name || `report-${report.id}`,
        disclaimer: "This MedIntel AI summary is for education only and is not a replacement for a qualified doctor."
    };
}

function buildAnalysisSummary(analysisResult) {
    const reportType = Array.isArray(analysisResult.report_type)
        ? analysisResult.report_type.join(", ")
        : analysisResult.report_type || "medical";
    const riskLevel = analysisResult.risk_level || "Unknown";
    const findings = parseList(analysisResult.findings);
    const recommendations = parseList(analysisResult.recommendations);

    return `This ${reportType} report is marked as ${riskLevel} risk. Key findings: ${findings.length ? findings.join("; ") : "No specific findings returned"}. Recommended next steps: ${recommendations.length ? recommendations.join("; ") : "No specific recommendations returned"}.`;
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
        cholesterol: "cholesterol",
        triglyceride: "triglycerides",
        triglycerides: "triglycerides",
        creatinine: "creatinine",
        alt: "alt",
        sgpt: "alt",
        ast: "ast",
        sgot: "ast",
        bilirubin: "bilirubin",
        urea: "urea",
        bun: "urea"
    };

    return map[normalized] || null;
}

function extractMedicalDataFromText(text = "") {
    const data = {};
    const regex = /(?:^|[\n;,])\s*[-*]?\s*(hemoglobin|hgb|hb|wbc|white blood cells?|platelets?|platelet count|glucose|blood sugar|hba1c|hb a1c|cholesterol|triglycerides?|creatinine|alt|sgpt|ast|sgot|bilirubin|urea|bun)\s*[:=\-]?\s*([<>]?\d+(?:\.\d+)?)/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const key = normalizeLabKey(match[1]);
        const value = Number(String(match[2]).replace(/[<>]/g, ""));

        if (key && Number.isFinite(value)) {
            data[key] = value;
        }
    }

    return data;
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

function buildSmartRecommendations(reportType, riskLevel, findings, medicalAnalysis) {
    const risk = String(riskLevel || "").toLowerCase();
    const abnormal = medicalAnalysis.filter((item) => String(item.status).toLowerCase() !== "normal");
    const recommendations = [];
    const add = (text) => {
        if (text && !recommendations.includes(text)) recommendations.push(text);
    };

    if (risk === "high") {
        add("Arrange prompt medical review and share this report with a clinician.");
    } else if (risk === "medium") {
        add("Schedule a follow-up visit to review abnormal or borderline findings.");
    } else {
        add("Use this report as a baseline and continue routine monitoring.");
    }

    abnormal.forEach((item) => {
        const name = String(item.test || "").toLowerCase();

        if (name.includes("glucose") || name.includes("hba1c")) {
            add("Track glucose trends, reduce high-sugar foods, and discuss diabetes screening or medication adjustment.");
        } else if (name.includes("cholesterol") || name.includes("triglycerides")) {
            add("Follow a heart-healthy diet, increase approved physical activity, and ask about lipid follow-up.");
        } else if (name.includes("hemoglobin")) {
            add("Ask about anemia evaluation, iron/B12/folate testing, and fatigue or breathlessness symptoms.");
        } else if (name.includes("wbc")) {
            add("Review infection or inflammation symptoms such as fever, cough, pain, or urinary issues.");
        } else if (name.includes("creatinine") || name.includes("urea")) {
            add("Review kidney function, hydration, blood pressure, and current medicines with a clinician.");
        } else if (["alt", "ast", "bilirubin"].some((key) => name.includes(key))) {
            add("Avoid alcohol and unnecessary over-the-counter medicines until liver markers are reviewed.");
        }
    });

    if (getReportCategory(reportType) === "Heart / Lipid") {
        add("Seek urgent care if chest pain, sweating, shortness of breath, fainting, or severe weakness occurs.");
    }

    if (!medicalAnalysis.length && findings.length) {
        add("Ask a clinician whether structured lab values or repeat testing are needed for a clearer interpretation.");
    }

    add("Do not change prescribed medicines based only on this AI interpretation.");

    return recommendations.slice(0, 8);
}

function buildEnhancedAnalysis(analysisResult, uploadedAt) {
    const reportType = Array.isArray(analysisResult.report_type)
        ? analysisResult.report_type.join(", ")
        : analysisResult.report_type || "general";
    const riskLevel = analysisResult.risk_level || "LOW";
    const findings = parseList(analysisResult.findings);
    const extractedData = extractMedicalDataFromText(analysisResult.extracted_text || "");
    const medicalAnalysis = analyzeReport(extractedData);
    const abnormalValues = medicalAnalysis.filter((item) => String(item.status).toLowerCase() !== "normal");
    const normalValues = medicalAnalysis.filter((item) => String(item.status).toLowerCase() === "normal");
    const recommendations = [
        ...buildSmartRecommendations(reportType, riskLevel, findings, medicalAnalysis),
        ...parseList(analysisResult.recommendations)
    ].filter((item, index, list) => list.indexOf(item) === index).slice(0, 10);
    const warningSignals = [];

    if (String(riskLevel).toLowerCase() === "high") {
        warningSignals.push("High-risk report pattern detected. Arrange prompt medical review.");
    }

    abnormalValues.slice(0, 3).forEach((item) => {
        if (item.severity === "critical") {
            warningSignals.push(`${item.test} is significantly ${String(item.status).toLowerCase()} and should be reviewed urgently.`);
        }
    });

    const patientSummary = abnormalValues.length
        ? `${getReportCategory(reportType)} report with ${abnormalValues.length} marker(s) needing attention. ${abnormalValues.slice(0, 3).map((item) => `${item.test} is ${String(item.status).toLowerCase()}`).join(", ")}.`
        : medicalAnalysis.length
            ? `Detected ${getReportCategory(reportType).toLowerCase()} values are within expected ranges. Keep this as a baseline.`
            : analysisResult.simplified_explanation || buildAnalysisSummary(analysisResult);
    const doctorSummary = abnormalValues.length
        ? abnormalValues.map((item) => `${item.test}: ${item.value} ${item.unit} (${item.status}, ref ${item.normalRange || "-"})`).join("; ")
        : "No abnormal structured markers extracted from the uploaded report.";
    const actionPlan = recommendations.slice(0, 5);
    const confidenceScore = Math.round(Number(analysisResult.confidence || 0.55) * 100);

    return {
        ...analysisResult,
        report_type: reportType,
        risk_level: riskLevel,
        findings,
        recommendations,
        medicalAnalysis,
        abnormalValues,
        normalValues,
        warning_signals: warningSignals,
        action_plan: actionPlan,
        top_recommendation: actionPlan[0] || "Review this report with a qualified clinician if symptoms are present.",
        patient_summary: patientSummary,
        doctor_summary: doctorSummary,
        ai_interpretation: `${getReportCategory(reportType)} interpretation generated from extracted text, risk level, findings, and structured lab values when available.`,
        confidence_score: Math.max(20, Math.min(95, confidenceScore)),
        trend_insight: "Trend comparison needs a prior structured report of the same type.",
        summary: patientSummary,
        simplified_explanation: patientSummary,
        uploaded_at: uploadedAt,
        disclaimer: analysisResult.disclaimer || "This MedIntel AI summary is for education only and is not a replacement for a qualified doctor."
    };
}

// =====================================================
// ANALYZE REPORT
// =====================================================

const analyzeUploadedReport = (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: "No file uploaded"
        });
    }

    const userId = req.user?.id;

    if (!userId) {
        fs.unlink(req.file.path, () => {});
        return res.status(401).json({
            success: false,
            message: "Authentication token is required"
        });
    }

    const filePath = req.file.path;
    const pythonCommand = process.platform === "win32" ? "python" : "python3";
    const python = spawn(pythonCommand, [
        path.join(__dirname, "../analyze_report.py"),
        filePath
    ]);

    let output = "";
    let errorOutput = "";

    python.stdout.on("data", (data) => {
        output += data.toString();
    });

    python.stderr.on("data", (data) => {
        errorOutput += data.toString();
    });

    python.on("error", (error) => {
        fs.unlink(filePath, () => {});

        return res.status(500).json({
            success: false,
            message: "Could not start Python analyzer",
            error: error.message
        });
    });

    python.on("close", (code) => {
        fs.unlink(filePath, () => {});

        if (code !== 0) {
            return res.status(500).json({
                success: false,
                message: "Analysis failed",
                error: errorOutput
            });
        }

        let analysisResult;

        try {
            analysisResult = JSON.parse(output.trim());
        } catch (parseError) {
            return res.status(500).json({
                success: false,
                message: "Failed to parse analysis result"
            });
        }

        const reportType = Array.isArray(analysisResult.report_type)
            ? analysisResult.report_type.join(", ")
            : analysisResult.report_type;
        const reportName = req.file.filename;
        const findings = Array.isArray(analysisResult.findings)
            ? analysisResult.findings.join(", ")
            : analysisResult.findings || "";
        const recommendations = Array.isArray(analysisResult.recommendations)
            ? analysisResult.recommendations.join(", ")
            : analysisResult.recommendations || "";
        const riskLevel = analysisResult.risk_level || "LOW";
        const uploadedAt = new Date().toISOString();
        const enhancedAnalysis = buildEnhancedAnalysis(analysisResult, uploadedAt);

        const sql = `
            INSERT INTO report_history
            (user_id, report_name, report_type, risk_level, findings, recommendations, uploaded_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `;

        db.query(sql, [userId, reportName, reportType, riskLevel, findings, enhancedAnalysis.recommendations.join("; ")], (dbErr, dbResult) => {
            if (dbErr) {
                return res.status(500).json({
                    success: false,
                    message: "Report analyzed but could not be saved"
                });
            }

            return res.status(200).json({
                status: "success",
                report_id: dbResult.insertId,
                uploaded_at: uploadedAt,
                analysis: enhancedAnalysis
            });
        });
    });
};

// =====================================================
// REPORT ROUTES
// =====================================================

router.post("/upload", authMiddleware, upload.single("report"), analyzeUploadedReport);
router.post("/analyze", authMiddleware, upload.single("report"), analyzeUploadedReport);

router.post("/export-pdf", (req, res) => {
    const body = req.body || {};
    const summary = {
        reportType: Array.isArray(body.report_type) ? body.report_type.join(", ") : body.report_type || body.reportType || "-",
        riskLevel: body.risk_level || body.riskLevel || "-",
        findings: parseList(body.findings),
        recommendations: parseList(body.recommendations),
        summary: body.summary || body.message || "-",
        fileName: body.uploaded_file || body.fileName || "uploaded-report",
        disclaimer: body.disclaimer || "This MedIntel AI summary is for education only and is not a replacement for a qualified doctor."
    };

    sendPdf(res, summary);
});

router.get("/all", authMiddleware, getAllReports);
router.get("/search/type", authMiddleware, searchReports);
router.get("/", authMiddleware, getAllReports);
router.get("/search", authMiddleware, searchReports);

router.get("/:id/pdf", authMiddleware, (req, res) => {
    const sql = `
        SELECT * FROM report_history
        WHERE id = ?
          AND user_id = ?
    `;

    db.query(sql, [req.params.id, req.user.id], (err, results) => {
        if (err) {
            return res.status(500).json({ message: "Database Error" });
        }

        if (!results.length) {
            return res.status(404).json({ message: "Report Not Found" });
        }

        const summary = buildStoredReportSummary(results[0]);
        const fileName = `report-${req.params.id}-summary.pdf`;
        return sendPdf(res, summary, fileName);
    });
});

router.get("/:id", authMiddleware, getSingleReport);
router.delete("/delete/:id", authMiddleware, deleteReport);
router.delete("/:id", authMiddleware, deleteReport);

module.exports = router;
