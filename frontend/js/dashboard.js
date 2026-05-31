document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "https://medintel-ai-yszx.onrender.com/api/report";
    const AUTH_BASE = "https://medintel-ai-yszx.onrender.com/api/auth";
    const ALL_REPORTS_URL = `${API_BASE}/all`;
    const REPORT_CONTEXT_KEY = "latestReportContext";
    const CHAT_ANALYSIS_KEY = "latestChatAnalysis";
    const TIMELINE_KEY = "healthcare_symptom_timeline";
    const auth = getAuth();

    if (!auth.token) {
        window.location.href = "login.html";
        return;
    }

    const totalReportsValue = document.getElementById("totalReportsValue");
    const highRiskValue = document.getElementById("highRiskValue");
    const latestTypeValue = document.getElementById("latestTypeValue");
    const chatContextValue = document.getElementById("chatContextValue");
    const dashboardRecentReports = document.getElementById("dashboardRecentReports");
    const timelineAnalytics = document.getElementById("timelineAnalytics");
    const dashboardConfidenceValue = document.getElementById("dashboardConfidenceValue");
    const dashboardConfidenceFill = document.getElementById("dashboardConfidenceFill");
    const dashboardConfidenceMeter = document.getElementById("dashboardConfidenceMeter");
    const dashboardRiskSummary = document.getElementById("dashboardRiskSummary");
    const dashboardReportActionContext = document.getElementById("dashboardReportActionContext");
    const dashboardProfileButton = document.getElementById("dashboardProfileButton");
    const dashboardProfileMenu = document.getElementById("dashboardProfileMenu");
    const dashboardProfileInitials = document.getElementById("dashboardProfileInitials");
    const dashboardProfileName = document.getElementById("dashboardProfileName");
    const dashboardProfileEmail = document.getElementById("dashboardProfileEmail");
    const dashboardLogoutButton = document.getElementById("dashboardLogoutButton");

    initProfileMenu();
    loadCurrentUser();
    loadDashboard();
    loadChatAnalytics();

    async function loadDashboard() {
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
                throw new Error(data.message || "Unable to load dashboard.");
            }

            const reports = normalizeReports(data).sort((a, b) => getDateValue(b) - getDateValue(a));
            renderStats(reports);
            renderReportActionContext(reports[0] || null);
            renderRecentReports(reports.slice(0, 5));
        } catch (error) {
            if (dashboardRecentReports) {
                dashboardRecentReports.innerHTML = `<p class="empty-state">${escapeHtml(error.message || "Unable to load reports.")}</p>`;
            }
            renderStats([]);
            renderReportActionContext(null);
        }
    }

    function initProfileMenu() {
        const storedUser = readStorage("user");
        if (storedUser) {
            renderSidebarProfile(storedUser);
        }

        dashboardProfileButton?.addEventListener("click", () => {
            const isHidden = dashboardProfileMenu?.classList.toggle("hidden");
            dashboardProfileButton.setAttribute("aria-expanded", String(!isHidden));
        });

        dashboardLogoutButton?.addEventListener("click", logout);

        document.addEventListener("click", (event) => {
            if (!dashboardProfileMenu || !dashboardProfileButton) return;
            if (dashboardProfileMenu.contains(event.target) || dashboardProfileButton.contains(event.target)) return;

            dashboardProfileMenu.classList.add("hidden");
            dashboardProfileButton.setAttribute("aria-expanded", "false");
        });
    }

    async function loadCurrentUser() {
        try {
            const response = await fetch(`${AUTH_BASE}/me`, {
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

            if (response.ok && data.user) {
                renderSidebarProfile(data.user);
                auth.storage.setItem("user", JSON.stringify(data.user));
            }
        } catch (error) {
            // Dashboard analytics can still render from local data if profile fetch is temporarily unavailable.
        }
    }

    async function logout() {
        try {
            await fetch(`${AUTH_BASE}/logout`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${auth.token}`
                }
            });
        } catch (error) {
            // Local logout is enough for the stateless JWT flow.
        } finally {
            clearAuth();
            window.location.href = "login.html";
        }
    }

    function renderSidebarProfile(user) {
        const name = user.full_name || user.username || "User";
        const email = user.email || "Signed in";

        setText(dashboardProfileInitials, getInitials(name));
        setText(dashboardProfileName, name);
        setText(dashboardProfileEmail, email);
    }

    function renderStats(reports) {
        const latestReport = reports[0] || null;
        const highRiskReports = reports.filter((report) => riskClass(report.risk_level || report.risk) === "high");
        const hasReportContext = Boolean(readStorage(REPORT_CONTEXT_KEY));

        setText(totalReportsValue, reports.length);
        setText(highRiskValue, highRiskReports.length);
        setText(latestTypeValue, latestReport ? formatValue(latestReport.report_type || latestReport.type) : "-");
        setText(chatContextValue, hasReportContext ? "On" : "Off");
    }

    function renderRecentReports(reports) {
        if (!dashboardRecentReports) return;
        dashboardRecentReports.innerHTML = "";

        if (!reports.length) {
            dashboardRecentReports.innerHTML = "<p class=\"empty-state\">No saved reports yet.</p>";
            return;
        }

        reports.forEach((report) => {
            const item = document.createElement("article");
            const header = document.createElement("div");
            const title = document.createElement("strong");
            const risk = document.createElement("span");
            const meta = document.createElement("span");
            const summary = document.createElement("p");

            item.className = `report-card risk-border-${riskClass(report.risk_level || report.risk)}`;
            header.className = "report-card-header";
            title.textContent = getReportName(report);
            risk.className = getRiskBadgeClass(report.risk_level || report.risk);
            risk.textContent = normalizeRisk(report.risk_level || report.risk);
            meta.textContent = `${formatValue(report.report_type || report.type)} | ${formatDate(report.uploaded_at || report.created_at || report.date)}`;
            summary.textContent = getSummary(report);

            header.appendChild(title);
            header.appendChild(risk);
            item.appendChild(header);
            item.appendChild(meta);
            item.appendChild(summary);
            dashboardRecentReports.appendChild(item);
        });
    }

    function renderReportActionContext(report) {
        if (!dashboardReportActionContext) return;

        const context = report || readStorage(REPORT_CONTEXT_KEY);
        dashboardReportActionContext.innerHTML = "";

        if (!context) {
            dashboardReportActionContext.innerHTML = "<p class=\"empty-state left\">Analyze or open a report to see a prioritized next step.</p>";
            return;
        }

        const recommendation = getTopReportRecommendation(context);
        const snapshot = document.createElement("div");
        const detail = document.createElement("div");

        snapshot.className = "dashboard-report-action-grid";
        snapshot.innerHTML = `
            <div class="recommendation-hero compact">
                <div>
                    <p class="eyebrow">What to do next</p>
                    <h3>${escapeHtml(recommendation)}</h3>
                    <p>${escapeHtml(context.ai_interpretation || context.summary || getSummary(context))}</p>
                </div>
                <span class="${getRiskBadgeClass(context.risk_level || context.risk)}">${escapeHtml(normalizeRisk(context.risk_level || context.risk))}</span>
            </div>
        `;

        detail.className = "context-report-snapshot";
        detail.innerHTML = `
            <strong>${escapeHtml(getReportName(context))}</strong>
            <span>${escapeHtml(formatValue(context.report_type || context.type))} | ${escapeHtml(formatDate(context.uploaded_at || context.created_at || context.date))}</span>
            <p>${escapeHtml(context.patient_summary || context.summary || getSummary(context))}</p>
        `;

        snapshot.appendChild(detail);
        dashboardReportActionContext.appendChild(snapshot);
    }

    function getTopReportRecommendation(report) {
        if (report.top_recommendation) {
            return formatValue(report.top_recommendation);
        }

        const actionPlan = Array.isArray(report.action_plan) ? report.action_plan : [];
        if (actionPlan.length) {
            return formatValue(actionPlan[0]);
        }

        const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];
        if (recommendations.length) {
            return formatValue(recommendations[0]);
        }

        return "Review the latest report and follow up with a clinician if symptoms are active or worsening.";
    }

    function loadChatAnalytics() {
        const latest = readStorage(CHAT_ANALYSIS_KEY);
        const timeline = readStorage(TIMELINE_KEY) || [];
        const confidence = getConfidence(latest);
        const risk = normalizeRisk(latest?.risk_level || "Unknown");

        updateConfidence(confidence);

        if (dashboardRiskSummary) {
            dashboardRiskSummary.innerHTML = "";
            const chip = document.createElement("span");
            chip.className = `risk-chip ${riskClass(risk)}`;
            chip.textContent = latest ? `${risk} risk` : "No chat analysis yet";
            dashboardRiskSummary.appendChild(chip);
        }

        renderTimelineAnalytics(timeline, latest);
    }

    function updateConfidence(confidence) {
        setText(dashboardConfidenceValue, `${confidence}%`);

        if (dashboardConfidenceFill) {
            dashboardConfidenceFill.style.width = "0%";
            requestAnimationFrame(() => {
                dashboardConfidenceFill.style.width = `${confidence}%`;
            });
        }

        if (dashboardConfidenceMeter) {
            dashboardConfidenceMeter.setAttribute("aria-valuenow", String(confidence));
        }
    }

    function renderTimelineAnalytics(timeline, latest) {
        if (!timelineAnalytics) return;
        timelineAnalytics.innerHTML = "";

        const entries = Array.isArray(timeline) && timeline.length
            ? timeline.slice(-6).reverse()
            : [];

        if (!entries.length && latest?.detected_symptoms?.length) {
            latest.detected_symptoms.forEach((symptom) => {
                entries.push({
                    message: symptom,
                    detected_symptoms: [symptom],
                    risk_level: latest.risk_level || "low",
                    time: new Date().toISOString()
                });
            });
        }

        if (!entries.length) {
            timelineAnalytics.innerHTML = "<p class=\"empty-state\">No symptom timeline yet.</p>";
            return;
        }

        entries.forEach((entry) => {
            const item = document.createElement("div");
            const title = document.createElement("strong");
            const details = document.createElement("p");
            const meta = document.createElement("span");

            item.className = `timeline-item ${entry.emergency ? "danger" : riskClass(entry.risk_level)}`;
            title.textContent = formatDate(entry.time);
            details.textContent = entry.message || "Symptom update";
            meta.textContent = entry.detected_symptoms?.length
                ? `Detected: ${entry.detected_symptoms.join(", ")}`
                : "Detected symptoms unavailable";

            item.appendChild(title);
            item.appendChild(details);
            item.appendChild(meta);
            timelineAnalytics.appendChild(item);
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

    function readStorage(key) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            return null;
        }
    }

    function getDateValue(report) {
        const date = new Date(report.uploaded_at || report.created_at || report.date || 0);
        return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    }

    function getReportName(report) {
        return formatValue(report.report_name || report.reportName || report.file_name || report.filename || report.name || `Report #${report.id || "-"}`);
    }

    function getSummary(report) {
        return formatValue(report.patient_summary || report.summary || report.simplified_explanation || "No summary stored for this report.");
    }

    function getRiskBadgeClass(value) {
        const risk = riskClass(value);
        return risk === "neutral" ? "badge neutral" : `badge ${risk}`;
    }

    function normalizeRisk(value) {
        const text = formatValue(value);
        return text === "-" ? "Unknown" : text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }

    function riskClass(value) {
        const risk = normalizeRisk(value).toLowerCase();
        return ["low", "medium", "high"].includes(risk) ? risk : "neutral";
    }

    function getConfidence(data) {
        const confidence = Number(data?.confidence);
        return Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 0;
    }

    function formatDate(value) {
        if (!value) return "-";

        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? formatValue(value) : date.toLocaleString();
    }

    function formatValue(value) {
        if (Array.isArray(value)) return value.join(", ");
        if (value && typeof value === "object") return JSON.stringify(value);
        return value === null || value === undefined || value === "" ? "-" : String(value);
    }

    function setText(element, value) {
        if (element) {
            element.textContent = value;
        }
    }

    function getInitials(name) {
        const parts = String(name || "User")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2);

        return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "U";
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
