document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "http://127.0.0.1:5000/api/report";
    const ALL_REPORTS_URL = `${API_BASE}/all`;
    const SEARCH_URL = `${API_BASE}/search/type`;
    const auth = getAuth();

    if (!auth.token) {
        window.location.href = "login.html";
        return;
    }

    const typeSearch = document.getElementById("typeSearch");
    const refreshButton = document.getElementById("refreshButton");
    const reportsStatus = document.getElementById("reportsStatus");
    const tableBody = document.getElementById("reportsTableBody");
    const reportsCardList = document.getElementById("reportsCardList");
    const detailPanel = document.getElementById("detailPanel");
    const detailTitle = document.getElementById("detailTitle");
    const detailContent = document.getElementById("detailContent");
    const detailLabAnalysis = document.getElementById("detailLabAnalysis");
    const detailRawJson = document.getElementById("detailRawJson");
    const closeDetailButton = document.getElementById("closeDetailButton");
    const downloadDetailPdfButton = document.getElementById("downloadDetailPdfButton");

    let searchTimer = null;
    let selectedReportId = null;

    if (!tableBody || !reportsStatus) {
        return;
    }

    loadReports();

    refreshButton?.addEventListener("click", () => {
        if (typeSearch) {
            typeSearch.value = "";
        }
        loadReports();
    });

    typeSearch?.addEventListener("input", () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => {
            loadReports(typeSearch.value.trim());
        }, 350);
    });

    closeDetailButton?.addEventListener("click", () => {
        detailPanel?.classList.add("hidden");
    });

    downloadDetailPdfButton?.addEventListener("click", () => {
        downloadReport(selectedReportId);
    });

    async function loadReports(type = "") {
        setStatus(type ? `Searching reports for "${type}"...` : "Loading reports...", "");
        renderLoading();

        try {
            const url = type ? `${SEARCH_URL}?type=${encodeURIComponent(type)}` : ALL_REPORTS_URL;
            const response = await fetch(url, {
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
                throw new Error(data.message || "Unable to load reports.");
            }

            const reports = normalizeReports(data).sort((a, b) => getDateValue(b) - getDateValue(a));
            renderReports(reports);
            renderReportCards(reports);
            setStatus(`${reports.length} report${reports.length === 1 ? "" : "s"} found.`, "success");
        } catch (error) {
            const message = error.message || "Unable to load reports.";
            renderTableMessage(message);
            renderCardMessage(message);
            setStatus(message, "error");
        }
    }

    function renderReports(reports) {
        tableBody.innerHTML = "";

        if (!reports.length) {
            renderTableMessage("No reports found.");
            return;
        }

        reports.forEach((report) => {
            const row = document.createElement("tr");
            row.appendChild(createCell(getReportId(report)));
            row.appendChild(createCell(getReportName(report)));
            row.appendChild(createCell(formatValue(report.report_type || report.type)));
            row.appendChild(createRiskCell(report.risk_level || report.risk));
            row.appendChild(createCell(formatDate(report.uploaded_at || report.created_at || report.date)));
            row.appendChild(createActionCell(report));
            tableBody.appendChild(row);
        });
    }

    function renderReportCards(reports) {
        if (!reportsCardList) return;

        reportsCardList.innerHTML = "";

        if (!reports.length) {
            renderCardMessage("No reports found.");
            return;
        }

        reports.forEach((report) => {
            const id = getReportId(report);
            const card = document.createElement("article");
            const header = document.createElement("div");
            const title = document.createElement("strong");
            const risk = document.createElement("span");
            const meta = document.createElement("div");
            const summary = document.createElement("p");
            const recommendation = document.createElement("div");
            const actions = document.createElement("div");

            card.className = `report-history-card risk-border-${riskClass(report.risk_level || report.risk)}`;
            header.className = "report-card-header";
            title.textContent = getReportName(report);
            risk.className = getRiskBadgeClass(report.risk_level || report.risk);
            risk.textContent = normalizeRisk(report.risk_level || report.risk);

            meta.className = "report-card-meta";
            meta.innerHTML = `
                <span>${escapeHtml(formatValue(report.report_type || report.type))}</span>
                <span>${escapeHtml(formatDate(report.uploaded_at || report.created_at || report.date))}</span>
            `;

            recommendation.className = "report-card-recommendation";
            recommendation.innerHTML = `
                <span>Top recommendation</span>
                <strong>${escapeHtml(report.top_recommendation || getFirstRecommendation(report) || "Review this report when symptoms change.")}</strong>
            `;

            summary.textContent = formatValue(report.patient_summary || report.summary || report.simplified_explanation || "No saved summary available.");
            actions.className = "report-card-actions";
            actions.appendChild(createButton("View", "secondary", () => viewReport(id)));
            actions.appendChild(createButton("Download", "secondary", () => downloadReport(id)));
            actions.appendChild(createButton("Delete", "danger", () => deleteReport(id)));

            header.appendChild(title);
            header.appendChild(risk);
            card.appendChild(header);
            card.appendChild(meta);
            card.appendChild(recommendation);
            card.appendChild(summary);
            card.appendChild(actions);
            reportsCardList.appendChild(card);
        });
    }

    function createActionCell(report) {
        const id = getReportId(report);
        const cell = document.createElement("td");
        const group = document.createElement("div");

        group.className = "action-group";
        group.appendChild(createButton("View", "secondary", () => viewReport(id)));
        group.appendChild(createButton("Download", "secondary", () => downloadReport(id)));
        group.appendChild(createButton("Delete", "danger", () => deleteReport(id)));
        cell.appendChild(group);

        return cell;
    }

    function createButton(label, variant, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `btn ${variant} small`;
        button.textContent = label;
        button.addEventListener("click", onClick);
        return button;
    }

    async function viewReport(id) {
        if (!id) {
            setStatus("Report ID is missing.", "error");
            return;
        }

        setStatus(`Loading report ${id}...`, "");

        try {
            const response = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
                headers: {
                    Authorization: `Bearer ${auth.token}`
                }
            });
            const data = await readJsonResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "Unable to load report detail.");
            }

            const report = data.report || data.data || data;
            renderDetail(report, data);
            setStatus(`Report ${id} loaded.`, "success");
        } catch (error) {
            setStatus(error.message || "Unable to load report detail.", "error");
        }
    }

    async function downloadReport(id) {
        if (!id) {
            setStatus("Select a report before downloading PDF.", "error");
            return;
        }

        setStatus(`Preparing report ${id} PDF...`, "");

        try {
            const response = await fetch(`${API_BASE}/${encodeURIComponent(id)}/pdf`, {
                headers: {
                    Authorization: `Bearer ${auth.token}`
                }
            });

            if (!response.ok) {
                const data = await readJsonResponse(response);
                throw new Error(data.message || "Unable to download PDF.");
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = `report-${id}-summary.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setStatus(`Report ${id} PDF downloaded.`, "success");
        } catch (error) {
            setStatus(error.message || "Unable to download PDF.", "error");
        }
    }

    async function deleteReport(id) {
        if (!id) {
            setStatus("Report ID is missing.", "error");
            return;
        }

        const confirmed = window.confirm(`Delete report ${id}?`);

        if (!confirmed) {
            return;
        }

        setStatus(`Deleting report ${id}...`, "");

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

            detailPanel?.classList.add("hidden");
            setStatus(data.message || "Report deleted successfully.", "success");
            loadReports(typeSearch?.value.trim() || "");
        } catch (error) {
            setStatus(error.message || "Unable to delete report.", "error");
        }
    }

    function renderDetail(report, rawData) {
        selectedReportId = getReportId(report);

        if (detailTitle) {
            detailTitle.textContent = `${getReportName(report)} (${getReportId(report)})`;
        }

        if (detailContent) {
            detailContent.innerHTML = "";

            const overview = createDetailSection("Report Overview", "overview");
            overview.appendChild(createOverviewGrid(report));
            detailContent.appendChild(overview);

            const nextSteps = createDetailSection("What To Do Next", "next");
            nextSteps.appendChild(createRecommendationHero(report));
            detailContent.appendChild(nextSteps);

            const findings = createDetailSection("Key Findings", "findings");
            findings.appendChild(createList(parseList(report.findings), "No saved findings were detected."));
            detailContent.appendChild(findings);

            const abnormal = createDetailSection("Abnormal Value Analysis", "abnormal");
            abnormal.appendChild(createLabGrid(report.abnormalValues || report.abnormal_values || [], true));
            detailContent.appendChild(abnormal);

            const normal = createDetailSection("Normal Markers", "normal");
            normal.appendChild(createLabGrid(report.normalValues || report.normal_values || [], false));
            detailContent.appendChild(normal);

            const interpretation = createDetailSection("AI Medical Interpretation", "interpretation");
            interpretation.appendChild(createParagraph(report.ai_interpretation || report.aiInterpretation || report.patient_summary || report.summary || "No AI interpretation is available for this saved report."));
            interpretation.appendChild(createParagraph(report.doctor_summary || report.doctorSummary || ""));
            detailContent.appendChild(interpretation);

            const recommendations = createDetailSection("Recommendations", "recommendations");
            recommendations.appendChild(createList(parseList(report.recommendations || report.action_plan), "No recommendations were saved for this report."));
            detailContent.appendChild(recommendations);

            const warnings = createDetailSection("Warning / Emergency Signals", "warnings");
            warnings.appendChild(createList(parseList(report.warning_signals || report.warningSignals), "No warning signals detected in the structured interpretation."));
            detailContent.appendChild(warnings);

            const followUp = createDetailSection("Follow-up Suggestions", "followup");
            followUp.appendChild(createList(parseList(report.action_plan || report.followUpSuggestions || report.follow_up_suggestions), "Keep monitoring and repeat testing as advised by your clinician."));
            const trend = createParagraph(report.trend_insight || report.trendInsight || "Trend comparison needs a prior report of the same type.");
            trend.className = "detail-note";
            followUp.appendChild(trend);
            detailContent.appendChild(followUp);
        }

        if (detailRawJson) {
            detailRawJson.textContent = JSON.stringify(rawData, null, 2);
        }

        renderDetailLabAnalysis(report.medicalAnalysis || report.lab_analysis || rawData.medicalAnalysis || rawData.lab_analysis);
        saveChatbotContext(report);
        detailPanel?.classList.remove("hidden");
        detailPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function createDetailSection(title, variant = "") {
        const section = document.createElement("section");
        const heading = document.createElement("h3");

        section.className = `report-detail-section ${variant}`.trim();
        heading.textContent = title;
        section.appendChild(heading);

        return section;
    }

    function createOverviewGrid(report) {
        const grid = document.createElement("div");
        const values = [
            ["Report Name", getReportName(report)],
            ["Report Type", report.report_type || report.type],
            ["Uploaded", formatDate(report.uploaded_at || report.created_at || report.date)],
            ["Risk Level", normalizeRisk(report.risk_level || report.risk)],
            ["Confidence", formatConfidence(report.confidence_score || report.confidence)],
            ["Category", report.structuredInterpretation?.category || report.category || "-"]
        ];

        grid.className = "detail-grid";

        values.forEach(([label, value]) => {
            const item = document.createElement("div");
            const itemLabel = document.createElement("span");
            const itemValue = document.createElement("strong");

            item.className = label === "Risk Level"
                ? `detail-item risk-border-${riskClass(value)}`
                : "detail-item";
            itemLabel.textContent = label;
            itemValue.textContent = formatValue(value);

            if (label === "Risk Level") {
                itemValue.className = `risk-chip ${riskClass(value)}`;
            }

            item.appendChild(itemLabel);
            item.appendChild(itemValue);
            grid.appendChild(item);
        });

        return grid;
    }

    function createRecommendationHero(report) {
        const card = document.createElement("div");
        const top = report.top_recommendation || getFirstRecommendation(report) || "Review this report with a qualified clinician if symptoms are present.";
        const reason = report.patient_summary || report.summary || "This action is based on report type, risk level, findings, and extracted lab values when available.";
        const confidence = formatConfidence(report.confidence_score || report.confidence);

        card.className = "recommendation-hero compact";
        card.innerHTML = `
            <div>
                <p class="eyebrow">Priority recommendation</p>
                <h3>${escapeHtml(top)}</h3>
                <p>${escapeHtml(reason)}</p>
            </div>
            <span class="confidence-badge">${escapeHtml(confidence)}</span>
        `;

        return card;
    }

    function createList(items, emptyText) {
        const list = document.createElement("ul");
        const values = Array.isArray(items) ? items.filter(Boolean) : [];

        list.className = "clean-list detail-list";

        if (!values.length) {
            const li = document.createElement("li");
            li.className = "empty-state left";
            li.textContent = emptyText;
            list.appendChild(li);
            return list;
        }

        values.forEach((value) => {
            const li = document.createElement("li");
            li.textContent = formatValue(value);
            list.appendChild(li);
        });

        return list;
    }

    function createParagraph(value) {
        const paragraph = document.createElement("p");
        paragraph.textContent = formatValue(value);
        return paragraph;
    }

    function createLabGrid(items, abnormalOnly = false) {
        const normalized = normalizeLabAnalysis(items);
        const filtered = abnormalOnly
            ? normalized.filter((item) => normalizeStatus(item.status) !== "normal")
            : normalized;
        const grid = document.createElement("div");

        grid.className = "lab-analysis-grid";

        if (!filtered.length) {
            const empty = document.createElement("p");
            empty.className = "empty-state left";
            empty.textContent = abnormalOnly ? "No abnormal structured values detected." : "No structured values detected.";
            grid.appendChild(empty);
            return grid;
        }

        filtered.forEach((item) => {
            grid.appendChild(createLabCard(item));
        });

        return grid;
    }

    function createLabCard(item) {
        const status = normalizeStatus(item.status);
        const card = document.createElement("article");
        const header = document.createElement("div");
        const name = document.createElement("strong");
        const badge = document.createElement("span");
        const valueText = document.createElement("p");
        const explanation = document.createElement("span");

        card.className = `lab-value-card ${status}`;
        header.className = "lab-value-header";
        name.textContent = formatValue(item.test || item.name || "Lab value");
        badge.className = `status-chip ${status}`;
        badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        valueText.textContent = `${formatValue(item.value)} ${formatValue(item.unit || "")}`.trim();
        explanation.textContent = `${formatValue(item.explanation || item.message || "No explanation available.")} Reference: ${formatValue(item.normalRange || item.normal_range || "-")}`;

        header.appendChild(name);
        header.appendChild(badge);
        card.appendChild(header);
        card.appendChild(valueText);
        card.appendChild(explanation);

        return card;
    }

    function renderDetailLabAnalysis(value) {
        if (!detailLabAnalysis) return;

        const items = normalizeLabAnalysis(value);
        detailLabAnalysis.innerHTML = "";

        if (!items.length) {
            detailLabAnalysis.classList.add("hidden");
            return;
        }

        const title = document.createElement("div");
        const grid = document.createElement("div");

        title.className = "section-title compact-title";
        title.innerHTML = `
            <div>
                <p class="eyebrow">Structured lab review</p>
                <h3>Detected values</h3>
            </div>
        `;
        grid.className = "lab-analysis-grid";

        items.forEach((item) => {
            const status = normalizeStatus(item.status);
            grid.appendChild(createLabCard(item));
        });

        detailLabAnalysis.appendChild(title);
        detailLabAnalysis.appendChild(grid);
        detailLabAnalysis.classList.remove("hidden");
    }

    function saveChatbotContext(report) {
        try {
            localStorage.setItem("latestReportContext", JSON.stringify({
                report_type: report.report_type || report.type || "",
                risk_level: report.risk_level || report.risk || "",
                uploaded_file: getReportName(report),
                findings: parseList(report.findings),
                recommendations: parseList(report.recommendations),
                summary: report.patient_summary || report.summary || report.simplified_explanation || "",
                top_recommendation: report.top_recommendation || getFirstRecommendation(report),
                action_plan: parseList(report.action_plan || report.recommendations),
                warning_signals: parseList(report.warning_signals),
                confidence_score: report.confidence_score || report.confidence,
                ai_interpretation: report.ai_interpretation || "",
                uploaded_at: report.uploaded_at || report.created_at || report.date || "",
                disclaimer: report.disclaimer || "This MedIntel AI summary is for education only and is not a replacement for a qualified doctor."
            }));
        } catch (error) {
            console.warn("Could not save report context for chatbot", error);
        }
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
                message: "Backend returned a non-JSON response.",
                raw_response: text
            };
        }
    }

    function normalizeReports(data) {
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.reports)) return data.reports;
        if (Array.isArray(data.data)) return data.data;
        return [];
    }

    function createCell(value) {
        const cell = document.createElement("td");
        cell.textContent = formatValue(value);
        return cell;
    }

    function createRiskCell(value) {
        const cell = document.createElement("td");
        const badge = document.createElement("span");

        badge.textContent = normalizeRisk(value);
        badge.className = getRiskBadgeClass(value);

        cell.appendChild(badge);
        return cell;
    }

    function renderLoading() {
        renderTableMessage("Loading reports...");
        renderCardMessage("Loading reports...");
    }

    function renderTableMessage(message) {
        tableBody.innerHTML = "";
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 6;
        cell.className = "empty-state";
        cell.textContent = message;

        row.appendChild(cell);
        tableBody.appendChild(row);
    }

    function renderCardMessage(message) {
        if (!reportsCardList) return;
        reportsCardList.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
    }

    function parseList(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value.map(formatValue);

        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed.map(formatValue) : [value];
            } catch (error) {
                return value.split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean);
            }
        }

        return [formatValue(value)];
    }

    function normalizeLabAnalysis(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value.filter(Boolean);

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

                return { test, value: item, status: "normal" };
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

    function getReportId(report) {
        return report.id || report.report_id || report.reportId || "";
    }

    function getReportName(report) {
        return formatValue(report.report_name || report.reportName || report.file_name || report.filename || report.name || `Report #${getReportId(report) || "-"}`);
    }

    function getFirstRecommendation(report) {
        return parseList(report.recommendations || report.action_plan)[0] || "";
    }

    function getDateValue(report) {
        const date = new Date(report.uploaded_at || report.created_at || report.date || 0);
        return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    }

    function formatDate(value) {
        if (!value) return "-";

        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? formatValue(value) : date.toLocaleString();
    }

    function normalizeRisk(value) {
        const text = formatValue(value);
        return text === "-" ? "Unknown" : text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }

    function riskClass(value) {
        const risk = normalizeRisk(value).toLowerCase();
        return ["low", "medium", "high"].includes(risk) ? risk : "neutral";
    }

    function getRiskBadgeClass(value) {
        const risk = riskClass(value);
        return risk === "neutral" ? "badge neutral" : `badge ${risk}`;
    }

    function formatConfidence(value) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return "-";
        }

        const score = number <= 1 ? Math.round(number * 100) : Math.round(number);
        return `${Math.max(0, Math.min(100, score))}%`;
    }

    function formatValue(value) {
        if (Array.isArray(value)) return value.join(", ");
        if (value && typeof value === "object") return JSON.stringify(value);
        return value === null || value === undefined || value === "" ? "-" : String(value);
    }

    function setStatus(message, type) {
        reportsStatus.textContent = message;
        reportsStatus.className = `status-message ${type || ""}`.trim();
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

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#039;");
    }
});
