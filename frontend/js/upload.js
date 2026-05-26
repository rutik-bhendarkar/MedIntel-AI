document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "http://127.0.0.1:5000/api/report";
    const UPLOAD_URL = `${API_BASE}/upload`;
    const ALL_REPORTS_URL = `${API_BASE}/all`;
    const auth = getAuth();

    if (!auth.token) {
        window.location.href = "login.html";
        return;
    }

    const fileInput = document.getElementById("reportFile");
    const selectedFileName = document.getElementById("selectedFileName");
    const analyzeButton = document.getElementById("analyzeButton");
    const clearResultsButton = document.getElementById("clearResultsButton");
    const copySummaryButton = document.getElementById("copySummaryButton");
    const downloadSummaryButton = document.getElementById("downloadSummaryButton");
    const downloadPdfButton = document.getElementById("downloadPdfButton");
    const uploadStatus = document.getElementById("uploadStatus");

    const emptyResult = document.getElementById("emptyResult");
    const resultSection = document.getElementById("resultSection");
    const riskBadge = document.getElementById("riskBadge");
    const summaryMessage = document.getElementById("summaryMessage");
    const reportType = document.getElementById("reportType");
    const uploadedFileName = document.getElementById("uploadedFileName");
    const uploadedAtValue = document.getElementById("uploadedAtValue");
    const nextStepsBlock = document.getElementById("nextStepsBlock");
    const topRecommendationText = document.getElementById("topRecommendationText");
    const topRecommendationReason = document.getElementById("topRecommendationReason");
    const confidenceScoreBadge = document.getElementById("confidenceScoreBadge");
    const emergencyAlert = document.getElementById("emergencyAlert");
    const emergencyAlertText = document.getElementById("emergencyAlertText");
    const summaryTextBlock = document.getElementById("summaryTextBlock");
    const summaryText = document.getElementById("summaryText");
    const doctorSummaryBlock = document.getElementById("doctorSummaryBlock");
    const doctorSummaryText = document.getElementById("doctorSummaryText");
    const aiInterpretationBlock = document.getElementById("aiInterpretationBlock");
    const aiInterpretationText = document.getElementById("aiInterpretationText");
    const findingsList = document.getElementById("findingsList");
    const recommendationsList = document.getElementById("recommendationsList");
    const warningSignalsBlock = document.getElementById("warningSignalsBlock");
    const warningSignalsList = document.getElementById("warningSignalsList");
    const followUpBlock = document.getElementById("followUpBlock");
    const followUpList = document.getElementById("followUpList");
    const labAnalysisBlock = document.getElementById("labAnalysisBlock");
    const labAnalysisList = document.getElementById("labAnalysisList");
    const rawJson = document.getElementById("rawJson");

    const recentSearch = document.getElementById("recentSearch");
    const recentStatus = document.getElementById("recentStatus");
    const recentReportsList = document.getElementById("recentReportsList");
    const refreshRecentButton = document.getElementById("refreshRecentButton");

    let allReports = [];
    let currentSummaryText = "";
    let currentPdfPayload = null;

    loadRecentReports();

    fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        selectedFileName.textContent = file ? file.name : "No file selected";
        setUploadStatus("", "");
    });

    analyzeButton.addEventListener("click", async () => {
        const file = fileInput.files[0];

        if (!file) {
            setUploadStatus("Please select a report file first.", "error");
            return;
        }

        if (!isAllowedFile(file.name)) {
            setUploadStatus("Only PDF, JPG, JPEG, and PNG files are allowed.", "error");
            return;
        }

        const formData = new FormData();
        formData.append("report", file);

        setLoading(true);
        setUploadStatus("Analyzing report. Please wait...", "");

        try {
            const response = await fetch(UPLOAD_URL, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${auth.token}`
                },
                body: formData
            });
            const data = await readJsonResponse(response);

            if (!response.ok || data.status === "error") {
                const requestError = new Error(data.message || data.error || "Report analysis failed.");
                requestError.details = data;
                throw requestError;
            }

            renderResult(data, file.name);
            setUploadStatus("Report analyzed successfully.", "success");
            await loadRecentReports();
        } catch (error) {
            renderError(error);
            setUploadStatus(error.message || "Unable to analyze report.", "error");
        } finally {
            setLoading(false);
            selectedFileName.textContent = file.name;
        }
    });

    clearResultsButton.addEventListener("click", () => {
        clearResults();
        setUploadStatus("Results cleared. Your selected file is still available.", "");
    });

    copySummaryButton.addEventListener("click", async () => {
        if (!currentSummaryText) {
            setUploadStatus("No summary is available to copy.", "error");
            return;
        }

        try {
            await copyText(currentSummaryText);
            setUploadStatus("Summary copied to clipboard.", "success");
        } catch (error) {
            setUploadStatus("Could not copy summary. Please try again.", "error");
        }
    });

    downloadSummaryButton.addEventListener("click", () => {
        if (!currentSummaryText) {
            setUploadStatus("No summary is available to download.", "error");
            return;
        }

        const fileName = `report-summary-${Date.now()}.txt`;
        const blob = new Blob([currentSummaryText], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        setUploadStatus("Summary downloaded.", "success");
    });

    downloadPdfButton.addEventListener("click", async () => {
        if (!currentPdfPayload) {
            setUploadStatus("No summary is available to export as PDF.", "error");
            return;
        }

        setUploadStatus("Creating PDF summary...", "");

        try {
            const response = await fetch(`${API_BASE}/export-pdf`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(currentPdfPayload)
            });

            if (!response.ok) {
                const errorData = await readJsonResponse(response);
                throw new Error(errorData.message || "Unable to create PDF summary.");
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = `report-summary-${Date.now()}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);

            setUploadStatus("PDF summary downloaded.", "success");
        } catch (error) {
            setUploadStatus(error.message || "Unable to download PDF summary.", "error");
        }
    });

    refreshRecentButton.addEventListener("click", loadRecentReports);

    recentSearch.addEventListener("input", () => {
        renderRecentReports();
    });

    async function loadRecentReports() {
        setRecentStatus("Loading recent reports...", "");

        try {
            const response = await fetch(ALL_REPORTS_URL, {
                headers: {
                    Authorization: `Bearer ${auth.token}`
                }
            });
            const data = await readJsonResponse(response);

            if (response.status === 401) {
                clearAuth();
                window.location.href = "login.html";
                return;
            }

            if (!response.ok) {
                throw new Error(data.message || "Unable to load recent reports.");
            }

            allReports = normalizeReports(data).sort((a, b) => {
                return getDateValue(b) - getDateValue(a);
            });

            renderRecentReports();
        } catch (error) {
            allReports = [];
            recentReportsList.innerHTML = `<p class="empty-state">${escapeHtml(error.message || "Unable to load recent reports.")}</p>`;
            setRecentStatus(error.message || "Unable to load recent reports.", "error");
        }
    }

    function renderRecentReports() {
        const searchValue = recentSearch.value.trim().toLowerCase();
        const filteredReports = allReports.filter((report) => {
            const type = formatValue(report.report_type || report.type).toLowerCase();
            return !searchValue || type.includes(searchValue);
        });
        const recentReports = filteredReports.slice(0, 5);

        recentReportsList.innerHTML = "";

        if (!recentReports.length) {
            recentReportsList.innerHTML = "<p class=\"empty-state\">No recent reports found.</p>";
            setRecentStatus(searchValue ? "No reports match this type." : "No saved reports yet.", "");
            return;
        }

        recentReports.forEach((report) => {
            const item = document.createElement("article");
            const main = document.createElement("button");
            const meta = document.createElement("div");
            const title = document.createElement("strong");
            const date = document.createElement("span");
            const risk = document.createElement("span");
            const actions = document.createElement("div");
            const viewButton = document.createElement("button");
            const deleteButton = document.createElement("button");

            item.className = "recent-report";
            main.className = "recent-report-main";
            main.type = "button";
            main.addEventListener("click", () => viewReport(getReportId(report)));

            meta.className = "recent-report-meta";
            title.textContent = getReportName(report);
            date.textContent = `${formatValue(report.report_type || report.type)} | ${formatDate(report.uploaded_at || report.created_at || report.date)}`;

            risk.className = getRiskBadgeClass(report.risk_level || report.risk);
            risk.textContent = normalizeRisk(report.risk_level || report.risk);

            actions.className = "recent-report-actions";
            viewButton.type = "button";
            viewButton.className = "btn secondary small";
            viewButton.textContent = "View";
            viewButton.addEventListener("click", () => viewReport(getReportId(report)));

            deleteButton.type = "button";
            deleteButton.className = "btn danger small";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", () => deleteReport(getReportId(report)));

            meta.appendChild(title);
            meta.appendChild(date);
            main.appendChild(meta);
            main.appendChild(risk);
            actions.appendChild(viewButton);
            actions.appendChild(deleteButton);
            item.appendChild(main);
            item.appendChild(actions);
            recentReportsList.appendChild(item);
        });

        setRecentStatus(`${filteredReports.length} report${filteredReports.length === 1 ? "" : "s"} available.`, "success");
    }

    async function viewReport(id) {
        if (!id) {
            setRecentStatus("Report ID is missing.", "error");
            return;
        }

        setRecentStatus(`Loading report ${id}...`, "");

        try {
            const response = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
                headers: {
                    Authorization: `Bearer ${auth.token}`
                }
            });
            const data = await readJsonResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "Unable to load report details.");
            }

            renderResult(data, getReportName(data.report || data));
            setRecentStatus(`Report ${id} loaded.`, "success");
            resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            setRecentStatus(error.message || "Unable to load report details.", "error");
        }
    }

    async function deleteReport(id) {
        if (!id) {
            setRecentStatus("Report ID is missing.", "error");
            return;
        }

        const confirmed = window.confirm(`Delete report ${id}?`);

        if (!confirmed) {
            return;
        }

        setRecentStatus(`Deleting report ${id}...`, "");

        try {
            const response = await fetch(`${API_BASE}/delete/${encodeURIComponent(id)}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${auth.token}`
                }
            });
            const data = await readJsonResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "Unable to delete report.");
            }

            setRecentStatus(data.message || "Report deleted successfully.", "success");
            await loadRecentReports();
        } catch (error) {
            setRecentStatus(error.message || "Unable to delete report.", "error");
        }
    }

    function renderResult(rawData, fallbackFileName) {
        const analysis = normalizeAnalysis(rawData);
        const risk = normalizeRisk(analysis.risk_level || rawData.risk_level);
        const type = formatValue(analysis.report_type || rawData.report_type || analysis.type);
        const fileName = getFileName(analysis.uploaded_file || rawData.uploaded_file || analysis.report_name || fallbackFileName);
        const uploadedAt = analysis.uploaded_at || rawData.uploaded_at || analysis.created_at || rawData.created_at || new Date().toISOString();
        const findings = parseList(analysis.findings || rawData.findings);
        const recommendations = parseList(analysis.recommendations || analysis.action_plan || rawData.recommendations);
        const emergencyItems = parseEmergencyAlert(analysis.emergency_alert || rawData.emergency_alert);
        const labAnalysis = normalizeLabAnalysis(analysis.medicalAnalysis || analysis.lab_analysis || rawData.medicalAnalysis || rawData.lab_analysis);
        const warningSignals = parseList(analysis.warning_signals || analysis.warningSignals || rawData.warning_signals);
        const followUpItems = parseList(analysis.action_plan || analysis.followUpSuggestions || analysis.follow_up_suggestions || recommendations.slice(0, 4));
        const summary = getSummaryText(analysis, findings, recommendations, risk, type);
        const doctorSummary = analysis.doctor_summary || analysis.doctorSummary || "";
        const aiInterpretation = analysis.ai_interpretation || analysis.aiInterpretation || "";
        const topRecommendation = analysis.top_recommendation || recommendations[0] || "Review this report with a qualified clinician if symptoms are present.";
        const confidenceScore = getConfidenceScore(analysis);
        const message = rawData.message || analysis.message || getSuccessMessage(rawData);

        emptyResult.classList.add("hidden");
        resultSection.classList.remove("hidden");

        riskBadge.textContent = risk;
        riskBadge.className = getRiskBadgeClass(risk);
        summaryMessage.textContent = message;
        reportType.textContent = type;
        uploadedFileName.textContent = fileName || "-";
        uploadedAtValue.textContent = formatDate(uploadedAt);

        renderList(findingsList, findings, "No findings returned.");
        renderList(recommendationsList, recommendations, "No recommendations returned.");
        renderEmergencyAlert(emergencyItems);
        renderRecommendationHero(topRecommendation, aiInterpretation || summary, confidenceScore);
        renderTextBlock(doctorSummaryBlock, doctorSummaryText, doctorSummary);
        renderTextBlock(aiInterpretationBlock, aiInterpretationText, aiInterpretation);
        renderToggledList(warningSignalsBlock, warningSignalsList, warningSignals, "");
        renderToggledList(followUpBlock, followUpList, followUpItems, "Continue routine follow-up as advised.");
        renderLabAnalysis(labAnalysis);
        renderSummaryText(summary);
        rawJson.textContent = JSON.stringify(rawData, null, 2);

        currentSummaryText = buildDownloadableSummary({
            message,
            risk,
            type,
            fileName,
            findings,
            recommendations,
            emergencyItems,
            warningSignals,
            followUpItems,
            labAnalysis,
            doctorSummary,
            aiInterpretation,
            summary,
            uploadedAt
        });
        currentPdfPayload = {
            report_type: type,
            risk_level: risk,
            uploaded_file: fileName,
            findings,
            recommendations,
            medicalAnalysis: labAnalysis,
            warning_signals: warningSignals,
            action_plan: followUpItems,
            doctor_summary: doctorSummary,
            ai_interpretation: aiInterpretation,
            summary,
            uploaded_at: uploadedAt,
            disclaimer: analysis.disclaimer || rawData.disclaimer || "This MedIntel AI summary is for education only and is not a replacement for a qualified doctor."
        };

        saveChatbotContext({
            report_type: type,
            risk_level: risk,
            uploaded_file: fileName,
            findings,
            recommendations,
            summary,
            top_recommendation: topRecommendation,
            warning_signals: warningSignals,
            action_plan: followUpItems,
            confidence_score: confidenceScore,
            ai_interpretation: aiInterpretation,
            emergency_alert: emergencyItems,
            uploaded_at: uploadedAt,
            extracted_text: analysis.extracted_text || rawData.extracted_text || "",
            disclaimer: currentPdfPayload.disclaimer
        });
    }

    function renderError(error) {
        emptyResult.classList.add("hidden");
        resultSection.classList.remove("hidden");

        riskBadge.textContent = "Error";
        riskBadge.className = "badge high";
        summaryMessage.textContent = error.message || "Analysis failed.";
        reportType.textContent = "-";
        uploadedFileName.textContent = getFileName(fileInput.files[0]?.name) || "-";
        uploadedAtValue.textContent = formatDate(new Date().toISOString());

        renderList(findingsList, [], "No findings available.");
        renderList(recommendationsList, [], "No recommendations available.");
        renderEmergencyAlert([]);
        renderRecommendationHero("Unable to analyze this report", "Please try another file or review the error details.", 0);
        renderTextBlock(doctorSummaryBlock, doctorSummaryText, "");
        renderTextBlock(aiInterpretationBlock, aiInterpretationText, "");
        renderToggledList(warningSignalsBlock, warningSignalsList, [], "");
        renderToggledList(followUpBlock, followUpList, [], "");
        renderLabAnalysis([]);
        renderSummaryText("");

        const errorPayload = error.details || {
            status: "error",
            message: error.message || "Unable to analyze report."
        };

        rawJson.textContent = JSON.stringify(errorPayload, null, 2);
        currentSummaryText = buildDownloadableSummary({
            message: summaryMessage.textContent,
            risk: "Error",
            type: "-",
            fileName: uploadedFileName.textContent,
            findings: [],
            recommendations: [],
            emergencyItems: [],
            warningSignals: [],
            followUpItems: [],
            doctorSummary: "",
            aiInterpretation: "",
            summary: "",
            uploadedAt: new Date().toISOString()
        });
        currentPdfPayload = null;
    }

    function clearResults() {
        currentSummaryText = "";
        currentPdfPayload = null;
        resultSection.classList.add("hidden");
        emptyResult.classList.remove("hidden");
        summaryMessage.textContent = "Upload a report to begin.";
        reportType.textContent = "-";
        uploadedFileName.textContent = "-";
        uploadedAtValue.textContent = "-";
        riskBadge.textContent = "Not analyzed";
        riskBadge.className = "badge neutral";
        rawJson.textContent = "No response yet.";
        renderList(findingsList, [], "No findings yet.");
        renderList(recommendationsList, [], "No recommendations yet.");
        renderEmergencyAlert([]);
        renderRecommendationHero("", "", 0);
        renderTextBlock(doctorSummaryBlock, doctorSummaryText, "");
        renderTextBlock(aiInterpretationBlock, aiInterpretationText, "");
        renderToggledList(warningSignalsBlock, warningSignalsList, [], "");
        renderToggledList(followUpBlock, followUpList, [], "");
        renderLabAnalysis([]);
        renderSummaryText("");
    }

    function normalizeAnalysis(rawData) {
        return rawData.analysis || rawData.report || rawData.result || rawData.data || rawData;
    }

    function getSummaryText(analysis, findings, recommendations, risk, type) {
        const summaryField = analysis.summary || analysis.report_summary || analysis.ai_summary || analysis.analysis_summary || analysis.text_summary || analysis.simplified_explanation;

        if (summaryField) {
            return formatValue(summaryField);
        }

        const findingText = findings.length ? findings.join("; ") : "No specific findings were returned.";
        const recommendationText = recommendations.length ? recommendations.join("; ") : "No specific recommendations were returned.";
        return `This report was classified as ${type || "unknown"} with ${risk.toLowerCase()} risk. Findings: ${findingText} Recommendations: ${recommendationText}`;
    }

    function parseEmergencyAlert(value) {
        if (value === true) {
            return ["This report includes a possible urgent warning. Please seek medical care if symptoms are active or worsening."];
        }

        if (value === false) {
            return [];
        }

        return parseList(value);
    }

    function saveChatbotContext(context) {
        try {
            localStorage.setItem("latestReportContext", JSON.stringify(context));
        } catch (error) {
            console.warn("Could not save chatbot context", error);
        }
    }

    function renderSummaryText(value) {
        if (!value) {
            summaryTextBlock.classList.add("hidden");
            summaryText.textContent = "";
            return;
        }

        summaryText.textContent = value;
        summaryTextBlock.classList.remove("hidden");
    }

    function renderEmergencyAlert(items) {
        if (!items.length) {
            emergencyAlert.classList.add("hidden");
            emergencyAlertText.textContent = "";
            return;
        }

        emergencyAlertText.textContent = items.join(" ");
        emergencyAlert.classList.remove("hidden");
    }

    function renderRecommendationHero(headline, reason, confidence) {
        if (!nextStepsBlock) return;

        if (!headline) {
            nextStepsBlock.classList.add("hidden");
            setText(topRecommendationText, "");
            setText(topRecommendationReason, "");
            setText(confidenceScoreBadge, "0%");
            return;
        }

        setText(topRecommendationText, headline);
        setText(topRecommendationReason, reason || "This recommendation is based on report type, risk level, and detected findings.");
        setText(confidenceScoreBadge, `${confidence}%`);
        nextStepsBlock.classList.remove("hidden");
    }

    function renderTextBlock(block, target, value) {
        if (!block || !target) return;

        if (!value) {
            block.classList.add("hidden");
            target.textContent = "";
            return;
        }

        target.textContent = formatValue(value);
        block.classList.remove("hidden");
    }

    function renderToggledList(block, listElement, items, emptyText) {
        if (!block || !listElement) return;

        listElement.innerHTML = "";

        if (!items.length && !emptyText) {
            block.classList.add("hidden");
            return;
        }

        renderList(listElement, items, emptyText);
        block.classList.remove("hidden");
    }

    function renderLabAnalysis(items) {
        if (!labAnalysisBlock || !labAnalysisList) return;

        labAnalysisList.innerHTML = "";

        if (!items.length) {
            labAnalysisBlock.classList.add("hidden");
            return;
        }

        items.forEach((item) => {
            const status = normalizeStatus(item.status);
            const card = document.createElement("article");
            const header = document.createElement("div");
            const title = document.createElement("strong");
            const badge = document.createElement("span");
            const value = document.createElement("p");
            const explanation = document.createElement("span");

            card.className = `lab-value-card ${status}`;
            header.className = "lab-value-header";
            title.textContent = formatValue(item.test || item.name || "Lab value");
            badge.className = `status-chip ${status}`;
            badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
            value.textContent = `${formatValue(item.value)} ${formatValue(item.unit || "")}`.trim();
            explanation.textContent = formatValue(item.explanation || item.message || "No explanation available.");

            header.appendChild(title);
            header.appendChild(badge);
            card.appendChild(header);
            card.appendChild(value);
            card.appendChild(explanation);
            labAnalysisList.appendChild(card);
        });

        labAnalysisBlock.classList.remove("hidden");
    }

    function renderList(listElement, items, emptyText) {
        listElement.innerHTML = "";

        if (!items.length) {
            const item = document.createElement("li");
            item.className = "empty-state";
            item.textContent = emptyText;
            listElement.appendChild(item);
            return;
        }

        items.forEach((value) => {
            const item = document.createElement("li");
            item.textContent = formatValue(value);
            listElement.appendChild(item);
        });
    }

    async function readJsonResponse(response) {
        const text = await response.text();

        if (!text) {
            return {};
        }

        try {
            return JSON.parse(text);
        } catch (error) {
            return {
                status: "error",
                message: "Backend returned a non-JSON response.",
                raw_response: text
            };
        }
    }

    function normalizeReports(data) {
        if (Array.isArray(data)) {
            return data;
        }

        if (Array.isArray(data.reports)) {
            return data.reports;
        }

        if (Array.isArray(data.data)) {
            return data.data;
        }

        return [];
    }

    function parseList(value) {
        if (!value) {
            return [];
        }

        if (Array.isArray(value)) {
            return value.map(formatValue).filter((item) => item && item !== "-");
        }

        if (typeof value === "string") {
            const trimmed = value.trim();

            if (!trimmed) {
                return [];
            }

            try {
                const parsed = JSON.parse(trimmed);
                return Array.isArray(parsed) ? parsed.map(formatValue).filter(Boolean) : [trimmed];
            } catch (error) {
                return trimmed.split(/\r?\n|;|,(?=\s*[A-Z])/).map((item) => item.trim()).filter(Boolean);
            }
        }

        if (typeof value === "object") {
            return [JSON.stringify(value)];
        }

        return [String(value)];
    }

    function normalizeLabAnalysis(value) {
        if (!value) {
            return [];
        }

        if (Array.isArray(value)) {
            return value.filter(Boolean);
        }

        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
            } catch (error) {
                return [];
            }
        }

        if (typeof value === "object") {
            return Object.entries(value).map(([test, item]) => {
                if (item && typeof item === "object") {
                    return { test, ...item };
                }

                return {
                    test,
                    value: item,
                    status: "normal"
                };
            });
        }

        return [];
    }

    function normalizeStatus(value) {
        const status = formatValue(value).toLowerCase();

        if (status.includes("low")) return "low";
        if (status.includes("high")) return "high";
        if (status.includes("abnormal")) return "high";
        if (status.includes("normal")) return "normal";

        return "normal";
    }

    function buildDownloadableSummary(data) {
        return [
            "MedIntel AI Report Summary",
            "",
            `Message: ${data.message}`,
            `Report Type: ${data.type}`,
            `Risk Level: ${data.risk}`,
            `Uploaded File: ${data.fileName || "-"}`,
            `Date/Time: ${formatDate(data.uploadedAt || new Date().toISOString())}`,
            "",
            "Summary:",
            data.summary || "-",
            "",
            "Findings:",
            formatListForText(data.findings),
            "",
            "Recommendations:",
            formatListForText(data.recommendations),
            "",
            "What To Do Next:",
            formatListForText(data.followUpItems),
            "",
            "Emergency Alert:",
            formatListForText(data.emergencyItems),
            "",
            "Warning Signals:",
            formatListForText(data.warningSignals),
            "",
            "Doctor-Friendly Summary:",
            data.doctorSummary || "-",
            "",
            "AI Medical Interpretation:",
            data.aiInterpretation || "-",
            "",
            "Structured Lab Review:",
            formatLabAnalysisForText(data.labAnalysis),
            "",
            "Disclaimer:",
            "This MedIntel AI summary is for education only and is not a replacement for a qualified doctor."
        ].join("\n");
    }

    function formatLabAnalysisForText(items) {
        if (!items || !items.length) {
            return "-";
        }

        return items
            .map((item) => {
                const label = formatValue(item.test || item.name || "Lab value");
                const value = `${formatValue(item.value)} ${formatValue(item.unit || "")}`.trim();
                const status = formatValue(item.status || "Normal");
                return `- ${label}: ${value} (${status})`;
            })
            .join("\n");
    }

    function formatListForText(items) {
        if (!items || !items.length) {
            return "-";
        }

        return items.map((item) => `- ${formatValue(item)}`).join("\n");
    }

    async function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
    }

    function isAllowedFile(fileName) {
        return /\.(pdf|jpg|jpeg|png)$/i.test(fileName);
    }

    function getSuccessMessage(data) {
        if (data.report_id) {
            return `Analysis completed. Saved as report #${data.report_id}.`;
        }

        return "Analysis completed.";
    }

    function getReportId(report) {
        return report.id || report.report_id || report.reportId || "";
    }

    function getReportName(report) {
        return formatValue(report.report_name || report.reportName || report.file_name || report.filename || report.name || `Report #${getReportId(report) || "-"}`);
    }

    function getFileName(value) {
        const text = formatValue(value);

        if (!text || text === "-") {
            return "";
        }

        return text.split(/[\\/]/).pop();
    }

    function getDateValue(report) {
        const date = new Date(report.uploaded_at || report.created_at || report.date || 0);
        return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    }

    function formatDate(value) {
        if (!value) {
            return "-";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return formatValue(value);
        }

        return date.toLocaleString();
    }

    function normalizeRisk(value) {
        const text = formatValue(value);

        if (!text || text === "-") {
            return "Unknown";
        }

        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }

    function getRiskBadgeClass(value) {
        const risk = normalizeRisk(value).toLowerCase();

        if (["low", "medium", "high"].includes(risk)) {
            return `badge ${risk}`;
        }

        return "badge neutral";
    }

    function getConfidenceScore(analysis) {
        const raw = analysis.confidence_score ?? analysis.confidence;
        const value = Number(raw);

        if (!Number.isFinite(value)) {
            return 0;
        }

        return value <= 1 ? Math.round(value * 100) : Math.round(Math.max(0, Math.min(100, value)));
    }

    function formatValue(value) {
        if (Array.isArray(value)) {
            return value.join(", ");
        }

        if (value && typeof value === "object") {
            return JSON.stringify(value);
        }

        return value === null || value === undefined || value === "" ? "-" : String(value);
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#039;");
    }

    function setLoading(isLoading) {
        analyzeButton.disabled = isLoading;
        clearResultsButton.disabled = isLoading;
        analyzeButton.innerHTML = isLoading
            ? "<span class=\"spinner light\" aria-hidden=\"true\"></span>Analyzing"
            : "Analyze Report";
    }

    function setUploadStatus(message, type) {
        uploadStatus.textContent = message;
        uploadStatus.className = `status-message ${type || ""}`.trim();
    }

    function setRecentStatus(message, type) {
        recentStatus.textContent = message;
        recentStatus.className = `status-message compact ${type || ""}`.trim();
    }

    function setText(element, value) {
        if (element) {
            element.textContent = value;
        }
    }

    function getAuth() {
        const localToken = localStorage.getItem("token");
        const sessionToken = sessionStorage.getItem("token");

        if (localToken) {
            return {
                token: localToken,
                storage: localStorage
            };
        }

        if (sessionToken) {
            return {
                token: sessionToken,
                storage: sessionStorage
            };
        }

        return {
            token: "",
            storage: localStorage
        };
    }

    function clearAuth() {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
    }
});
