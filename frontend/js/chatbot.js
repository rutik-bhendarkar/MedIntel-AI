document.addEventListener("DOMContentLoaded", () => {
    const API_URL = "http://127.0.0.1:5000/api/chat/ask";

    const chatForm = document.getElementById("chatForm");
    const chatInput = document.getElementById("chatInput");
    const chatMessages = document.getElementById("chatMessages");
    const sendButton = document.getElementById("sendButton");
    const voiceButton = document.getElementById("voiceButton");
    const voiceStatus = document.getElementById("voiceStatus");
    const downloadPdfButton = document.getElementById("downloadPdfButton");
    const loadingIndicator = document.getElementById("loadingIndicator");
    const followUpChips = document.getElementById("followUpChips");
    const resetChatButton = document.getElementById("resetChatButton");
    const emergencyBanner = document.getElementById("emergencyBanner");
    const emergencyText = document.getElementById("emergencyText");
    const urgencyBadge = document.getElementById("urgencyBadge");
    const reportContextStatus = document.getElementById("reportContextStatus");
    const futureForecastContainer = document.getElementById("futureForecast");

    const explanationConfidence = document.getElementById("explanationConfidence");
    const explanationConfidenceFill = document.getElementById("explanationConfidenceFill");
    const explanationConfidenceMeter = document.getElementById("explanationConfidenceMeter");
    const explanationSymptoms = document.getElementById("explanationSymptoms");
    const explanationGroup = document.getElementById("explanationGroup");
    const explanationPatterns = document.getElementById("explanationPatterns");
    const explanationRisk = document.getElementById("explanationRisk");
    const topThinkingList = document.getElementById("topThinkingList");
    const confidenceGapText = document.getElementById("confidenceGapText");
    const followUpReason = document.getElementById("followUpReason");
    const emergencyReason = document.getElementById("emergencyReason");
    const explanationReason = document.getElementById("explanationReason");
    const timelineList = document.getElementById("timelineList");
    const chatRecommendationsList = document.getElementById("chatRecommendationsList");
    const probabilityContainer = document.getElementById("probabilityContainer");

    const CHAT_STORAGE_KEY = "healthcare_chat_history";
    const SESSION_ID_KEY = "healthcare_chat_session_id";
    const TIMELINE_KEY = "healthcare_symptom_timeline";
    const CHAT_ANALYSIS_KEY = "latestChatAnalysis";
    const REPORT_CONTEXT_KEY = "latestReportContext";
    const DEFAULT_VOICE_LABEL = "Voice";
    const DEFAULT_CHAT_PLACEHOLDER = "Describe symptoms, duration, severity, or changes...";

    let chatHistory = readJSON(CHAT_STORAGE_KEY, []);
    let symptomTimeline = readJSON(TIMELINE_KEY, []);
    let latestChatAnalysis = readJSON(CHAT_ANALYSIS_KEY, null);
    let isLoading = false;
    let thinkingBubble = null;

    const sessionId = getOrCreateSessionId();

    if (!chatForm || !chatInput || !chatMessages || !sendButton) {
        return;
    }

    init();
    initVoiceRecognition();
    initPdfExport();

    function init() {
        renderReportContext();
        renderHistory();
        renderTimeline(symptomTimeline);
        renderStoredAnalysis();

        if (!chatHistory.length) {
            addBotMessage(
                "Hello, I am your MedIntel AI assistant. Describe symptoms, duration, severity, or changes, and I will help with follow-up questions and safe guidance.",
                null,
                { animate: false }
            );
        }

        chatForm.addEventListener("submit", handleSubmit);

        if (resetChatButton) {
            resetChatButton.addEventListener("click", resetChat);
        }
    }

    function resetChat() {
        chatHistory = [];
        symptomTimeline = [];
        latestChatAnalysis = null;

        saveJSON(CHAT_STORAGE_KEY, chatHistory);
        saveJSON(TIMELINE_KEY, symptomTimeline);
        localStorage.removeItem(CHAT_ANALYSIS_KEY);

        chatMessages.innerHTML = "";
        chatInput.placeholder = DEFAULT_CHAT_PLACEHOLDER;
        clearFollowUps();
        clearPanels();
        hideEmergency();

        if (urgencyBadge) {
            urgencyBadge.textContent = "Monitoring";
            urgencyBadge.className = "urgency-badge calm";
        }

        addBotMessage("Chat reset. Please describe your symptoms again.", null, { animate: false });
    }

    function getOrCreateSessionId() {
        const existing = localStorage.getItem(SESSION_ID_KEY);
        if (existing) return existing;

        const id = (window.crypto && window.crypto.randomUUID)
            ? window.crypto.randomUUID()
            : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        localStorage.setItem(SESSION_ID_KEY, id);
        return id;
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (isLoading) return;

        const message = chatInput.value.trim();
        if (!message) return;

        await sendMessage(message);
    }

    async function sendMessage(message) {
        addUserMessage(message);
        chatInput.value = "";
        chatInput.placeholder = DEFAULT_CHAT_PLACEHOLDER;
        clearFollowUps();
        setLoading(true);
        showThinkingBubble();

        try {
            const reportContext = readJSON(REPORT_CONTEXT_KEY, null);

            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message,
                    sessionId,
                    previousMessages: chatHistory.slice(-12),
                    symptomTimeline,
                    selectedReportContext: reportContext
                })
            });

            const data = await readJsonResponse(response);

            if (!response.ok || data.success === false) {
                throw new Error(data.message || data.error || "Chat request failed.");
            }

            latestChatAnalysis = data;
            saveJSON(CHAT_ANALYSIS_KEY, data);

            removeThinkingBubble();
            await addBotMessage(data.reply || "I have received your message.", data, { animate: true });

            updatePanels(data);
            renderFollowUps(data.follow_up_questions || []);
            updateEmergencyUI(data);
            updateUrgencyBadge(data);
            appendTimelineEntry(message, data);
            saveConversationState();
        } catch (error) {
            removeThinkingBubble();
            await addBotMessage(
                error.message || "Unable to reach the chatbot backend. Please try again.",
                { risk_level: "medium", confidence: 0 },
                { animate: false }
            );
            clearFollowUps();
        } finally {
            setLoading(false);
            chatInput.focus();
        }
    }

    function addUserMessage(text) {
        addMessageBubble("user", text);
        chatHistory.push({
            role: "user",
            message: text,
            time: new Date().toISOString()
        });
        saveJSON(CHAT_STORAGE_KEY, chatHistory);
    }

    async function addBotMessage(text, data = null, options = {}) {
        const bubble = addMessageBubble("bot", "", data);
        const paragraph = bubble.querySelector("p");
        const cleanText = formatValue(text);

        if (options.animate) {
            await typeText(paragraph, cleanText);
        } else {
            paragraph.textContent = cleanText;
        }

        if (data) {
            renderMessageMeta(bubble, data);
        }

        chatHistory.push({
            role: "assistant",
            message: cleanText,
            meta: {
                risk_level: data?.risk_level || data?.riskLevel || "",
                confidence: getConfidence(data)
            },
            time: new Date().toISOString()
        });
        saveJSON(CHAT_STORAGE_KEY, chatHistory);
    }

    function addMessageBubble(role, text, data = null) {
        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${role === "user" ? "user-message" : "bot-message"}`;

        if (data?.risk_level) {
            bubble.classList.add(`risk-border-${riskClass(data.risk_level)}`);
        }

        const p = document.createElement("p");
        p.textContent = text;
        bubble.appendChild(p);

        chatMessages.appendChild(bubble);
        scrollChatToBottom();

        return bubble;
    }

    function renderMessageMeta(bubble, data) {
        const confidence = getConfidence(data);
        const risk = normalizeRisk(data.risk_level || data.riskLevel || "low");
        const meta = document.createElement("div");
        const riskBadge = document.createElement("span");
        const confidenceWrap = document.createElement("span");
        const bar = document.createElement("span");
        const fill = document.createElement("span");
        const text = document.createElement("span");

        meta.className = "message-meta";
        riskBadge.className = `risk-chip ${riskClass(risk)}`;
        riskBadge.textContent = `${risk} risk`;

        confidenceWrap.className = "message-confidence";
        bar.className = "mini-meter";
        fill.className = "mini-meter-fill";
        text.textContent = `${confidence}% confidence`;

        bar.appendChild(fill);
        confidenceWrap.appendChild(bar);
        confidenceWrap.appendChild(text);
        meta.appendChild(riskBadge);
        meta.appendChild(confidenceWrap);
        bubble.appendChild(meta);

        requestAnimationFrame(() => {
            fill.style.width = `${confidence}%`;
        });
    }

    function showThinkingBubble() {
        removeThinkingBubble();

        thinkingBubble = document.createElement("div");
        thinkingBubble.className = "chat-bubble bot-message typing-message";
        thinkingBubble.innerHTML = `
            <span class="typing-label">AI is thinking</span>
            <span class="typing-dots" aria-hidden="true">
                <span></span><span></span><span></span>
            </span>
        `;
        chatMessages.appendChild(thinkingBubble);
        scrollChatToBottom();
    }

    function removeThinkingBubble() {
        if (thinkingBubble && thinkingBubble.parentNode) {
            thinkingBubble.remove();
        }

        thinkingBubble = null;
    }

    function typeText(element, text) {
        return new Promise((resolve) => {
            if (!element) {
                resolve();
                return;
            }

            const words = String(text || "").split(/(\s+)/);
            let index = 0;

            const step = () => {
                element.textContent += words[index] || "";
                index += 1;
                scrollChatToBottom();

                if (index < words.length) {
                    window.setTimeout(step, words[index - 1]?.trim() ? 22 : 8);
                    return;
                }

                resolve();
            };

            step();
        });
    }

    function updatePanels(data) {
        const confidence = getConfidence(data);
        const risk = normalizeRisk(data.risk_level || data.risk || "low");

        updateConfidenceUI(confidence);
        setText(explanationSymptoms, formatArray(data.detected_symptoms) || "None yet.");
        setText(explanationGroup, data.symptom_group || "Unclear");
        setText(explanationPatterns, formatTopThinking(data.top_three_thinking) || "No pattern yet.");
        setRiskElement(explanationRisk, risk);

        setText(
            confidenceGapText,
            data.confidence_gap_analysis?.message ||
            data.confidence_gap ||
            "More detail will narrow the possibilities."
        );

        setText(
            followUpReason,
            data.reason_for_follow_up ||
            (data.follow_up_needed ? "Important context is still missing." : "Enough context is available.")
        );

        setText(
            emergencyReason,
            data.reason_for_emergency ||
            data.risk_message ||
            (data.emergency || data.emergency_alert ? "Emergency pattern detected." : "No emergency pattern detected yet.")
        );

        setText(
            explanationReason,
            data.explanation ||
            data.summary ||
            "Share symptoms, duration, severity, and progression to improve guidance."
        );

        renderTopThinking(data.top_three_thinking || []);
        renderRecommendations(data.recommendations || []);
        renderProbabilityChart(data.top_three_thinking || []);
        renderFutureForecast(data);
        renderReportContext(data.report_context || null);
    }

    function updateConfidenceUI(confidence) {
        setText(explanationConfidence, `${confidence}%`);

        if (explanationConfidenceFill) {
            explanationConfidenceFill.style.width = "0%";
            requestAnimationFrame(() => {
                explanationConfidenceFill.style.width = `${confidence}%`;
            });
        }

        if (explanationConfidenceMeter) {
            explanationConfidenceMeter.setAttribute("aria-valuenow", String(confidence));
        }
    }

    function renderFollowUps(questions) {
        if (!followUpChips) return;

        followUpChips.innerHTML = "";

        const uniqueQuestions = [...new Set(
            questions.filter(Boolean).map((q) => q.trim()).filter(Boolean)
        )];

        if (!uniqueQuestions.length) {
            followUpChips.classList.add("hidden");
            return;
        }

        uniqueQuestions.forEach((question) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "follow-up-chip";
            chip.textContent = question;
            chip.title = "Answer this follow-up";
            chip.setAttribute("aria-label", `Answer follow-up: ${question}`);
            chip.addEventListener("click", () => {
                if (!isLoading) {
                    chatInput.placeholder = `Answer: ${question}`;
                    chatInput.focus();
                }
            });
            followUpChips.appendChild(chip);
        });

        followUpChips.classList.remove("hidden");
    }

    function clearFollowUps() {
        if (!followUpChips) return;
        followUpChips.innerHTML = "";
        followUpChips.classList.add("hidden");
    }

    function renderTopThinking(items) {
        if (!topThinkingList) return;
        topThinkingList.innerHTML = "";

        const validItems = getValidScores(items);

        if (!validItems.length) {
            const li = document.createElement("li");
            li.textContent = "I still need a few symptom details.";
            topThinkingList.appendChild(li);
            return;
        }

        validItems.slice(0, 3).forEach((item) => {
            const li = document.createElement("li");
            li.innerHTML = `
                <span>${escapeHtml(item.label)}</span>
                <span class="score-pill">${item.score}%</span>
            `;
            topThinkingList.appendChild(li);
        });
    }

    function renderProbabilityChart(items) {
        if (!probabilityContainer) return;

        probabilityContainer.innerHTML = "";

        const validItems = getValidScores(items);

        if (!validItems.length) {
            probabilityContainer.innerHTML = "<p class=\"empty-state left\">Share symptoms to calculate pattern probabilities.</p>";
            return;
        }

        validItems.forEach((item) => {
            const wrapper = document.createElement("div");
            const label = document.createElement("div");
            const bar = document.createElement("div");
            const fill = document.createElement("div");

            wrapper.className = "probability-item";
            label.className = "probability-label";
            label.innerHTML = `<span>${escapeHtml(item.label)}</span><span>${item.score}%</span>`;
            bar.className = "probability-bar";
            fill.className = `probability-fill ${scoreClass(item.score)}`;

            bar.appendChild(fill);
            wrapper.appendChild(label);
            wrapper.appendChild(bar);
            probabilityContainer.appendChild(wrapper);

            requestAnimationFrame(() => {
                fill.style.width = `${item.score}%`;
            });
        });
    }

    function renderFutureForecast(data) {
        if (!futureForecastContainer) return;

        if (!data?.futureForecast) {
            futureForecastContainer.innerHTML = "";
            return;
        }

        const f = data.futureForecast;
        const next24h = Array.isArray(f.next24h) ? f.next24h : [];
        const next48h = Array.isArray(f.next48h) ? f.next48h : [];
        const next72h = Array.isArray(f.next72h) ? f.next72h : [];
        const warning = Array.isArray(f.warning) ? f.warning : [];

        if (!next24h.length && !next48h.length && !next72h.length && !warning.length) {
            futureForecastContainer.innerHTML = "";
            return;
        }

        futureForecastContainer.innerHTML = `
            <div class="future-forecast-card future-${escapeHtml(f.level || "unknown")}">
              <h3>Future Condition Forecast</h3>
              <p class="forecast-title">${escapeHtml(f.title || "Forecast")}</p>

              <div class="forecast-block">
                <strong>Next 24 hours</strong>
                <ul>${next24h.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
              </div>

              <div class="forecast-block">
                <strong>Next 48 hours</strong>
                <ul>${next48h.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
              </div>

              <div class="forecast-block">
                <strong>Next 72 hours</strong>
                <ul>${next72h.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
              </div>

              <div class="forecast-warning">
                <strong>Warning</strong>
                <ul>${warning.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
              </div>
            </div>
        `;
    }

    function getValidScores(items) {
        if (!Array.isArray(items)) return [];

        return items
            .filter((item) => item && typeof item.score === "number" && item.score > 0)
            .map((item) => ({
                label: String(item.label || item.name || "Pattern").replace(/^\d+\.\s*/, "").trim(),
                score: Math.max(0, Math.min(100, Math.round(item.score)))
            }))
            .filter((item) => item.label && item.label !== "Pattern");
    }

    function renderRecommendations(items) {
        if (!chatRecommendationsList) return;
        chatRecommendationsList.innerHTML = "";

        if (!Array.isArray(items) || !items.length) {
            const li = document.createElement("li");
            li.className = "empty-state left";
            li.textContent = "Describe symptoms to get context-aware guidance.";
            chatRecommendationsList.appendChild(li);
            return;
        }

        items.slice(0, 5).forEach((item) => {
            const li = document.createElement("li");
            li.textContent = item;
            chatRecommendationsList.appendChild(li);
        });
    }

    function appendTimelineEntry(message, data) {
        const entry = {
            time: new Date().toISOString(),
            message,
            detected_symptoms: Array.isArray(data.detected_symptoms) ? data.detected_symptoms : [],
            emergency: Boolean(data.emergency || data.emergency_alert),
            risk_level: data.risk_level || "low"
        };

        symptomTimeline.push(entry);
        symptomTimeline = symptomTimeline.slice(-20);
        saveJSON(TIMELINE_KEY, symptomTimeline);
        renderTimeline(symptomTimeline);
    }

    function renderTimeline(entries) {
        if (!timelineList) return;
        timelineList.innerHTML = "";

        if (!Array.isArray(entries) || !entries.length) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No symptom updates yet.";
            timelineList.appendChild(empty);
            return;
        }

        entries.slice(-8).forEach((entry) => {
            const risk = riskClass(entry.risk_level);
            const card = document.createElement("div");
            const title = document.createElement("strong");
            const message = document.createElement("p");
            const meta = document.createElement("span");

            card.className = `timeline-item ${entry.emergency ? "danger" : risk}`;
            title.textContent = formatTime(entry.time);
            message.textContent = entry.message;
            meta.textContent = entry.detected_symptoms?.length
                ? `Symptoms: ${entry.detected_symptoms.join(", ")}`
                : "Symptoms: not detected";

            card.appendChild(title);
            card.appendChild(message);
            card.appendChild(meta);
            timelineList.appendChild(card);
        });
    }

    function updateEmergencyUI(data) {
        if (data.emergency || data.emergency_alert) {
            if (emergencyBanner) {
                emergencyBanner.classList.remove("hidden");
                emergencyBanner.className = "chat-emergency-banner high";
            }

            setText(
                emergencyText,
                data.emergency_message ||
                data.emergencyMessage ||
                "Please seek immediate medical help if symptoms are severe or worsening."
            );
        } else {
            hideEmergency();
        }
    }

    function hideEmergency() {
        if (emergencyBanner) {
            emergencyBanner.classList.add("hidden");
        }
        setText(emergencyText, "");
    }

    function updateUrgencyBadge(data) {
        if (!urgencyBadge) return;

        const risk = riskClass(data.risk_level || "low");

        if (data.emergency || data.emergency_alert || risk === "high") {
            urgencyBadge.textContent = "Urgent";
            urgencyBadge.className = "urgency-badge danger";
        } else if (risk === "medium") {
            urgencyBadge.textContent = "Watch";
            urgencyBadge.className = "urgency-badge watch";
        } else {
            urgencyBadge.textContent = "Monitoring";
            urgencyBadge.className = "urgency-badge calm";
        }
    }

    function renderReportContext(data = null) {
        if (!reportContextStatus) return;

        const context = data || readJSON(REPORT_CONTEXT_KEY, null);
        reportContextStatus.innerHTML = "";

        if (!context) {
            reportContextStatus.textContent = "No report context selected yet.";
            return;
        }

        const fragment = document.createDocumentFragment();
        const recommendationCard = document.createElement("div");
        const title = document.createElement("strong");
        const risk = document.createElement("span");
        const file = document.createElement("span");
        const summaryWrap = document.createElement("div");
        const topRecommendation = getTopReportRecommendation(context);

        recommendationCard.className = "context-recommendation-card";
        recommendationCard.innerHTML = `
            <span>What to do next</span>
            <strong>${escapeHtml(topRecommendation)}</strong>
            <p>${escapeHtml(context.ai_interpretation || context.summary || "Based on the latest report context saved for this chat.")}</p>
        `;
        fragment.appendChild(recommendationCard);

        summaryWrap.className = "context-report-snapshot";
        title.textContent = formatValue(context.report_type || context.type || "Medical report");
        risk.className = `risk-chip ${riskClass(context.risk_level || context.risk || "low")}`;
        risk.textContent = `${normalizeRisk(context.risk_level || context.risk || "Unknown")} risk`;
        file.textContent = `File: ${formatValue(context.uploaded_file || context.report_name || "")}`;

        summaryWrap.appendChild(title);
        summaryWrap.appendChild(document.createElement("br"));
        summaryWrap.appendChild(risk);
        summaryWrap.appendChild(document.createElement("br"));
        summaryWrap.appendChild(file);

        if (context.summary) {
            const summary = document.createElement("p");
            summary.textContent = formatValue(context.summary);
            summaryWrap.appendChild(summary);
        }

        fragment.appendChild(summaryWrap);
        reportContextStatus.appendChild(fragment);
    }

    function getTopReportRecommendation(context) {
        if (context.top_recommendation) {
            return formatValue(context.top_recommendation);
        }

        const actionPlan = Array.isArray(context.action_plan) ? context.action_plan : [];
        if (actionPlan.length) {
            return formatValue(actionPlan[0]);
        }

        const recommendations = Array.isArray(context.recommendations) ? context.recommendations : [];
        if (recommendations.length) {
            return formatValue(recommendations[0]);
        }

        return "Review the latest report and follow up with a clinician if symptoms are active or worsening.";
    }

    function clearPanels() {
        updateConfidenceUI(0);
        setText(explanationSymptoms, "None yet.");
        setText(explanationGroup, "Unclear");
        setText(explanationPatterns, "None yet.");
        setRiskElement(explanationRisk, "Low");
        setText(confidenceGapText, "More detail will narrow the possibilities.");
        setText(followUpReason, "I will ask only when important context is missing.");
        setText(emergencyReason, "No emergency pattern detected yet.");
        setText(explanationReason, "Share symptoms, duration, severity, and progression to improve guidance.");

        if (topThinkingList) {
            topThinkingList.innerHTML = "<li>No symptom pattern yet.</li>";
        }

        if (chatRecommendationsList) {
            chatRecommendationsList.innerHTML = "<li class=\"empty-state left\">Describe symptoms to get context-aware guidance.</li>";
        }

        if (timelineList) {
            timelineList.innerHTML = "<p class=\"empty-state\">No symptom updates yet.</p>";
        }

        if (probabilityContainer) {
            probabilityContainer.innerHTML = "<p class=\"empty-state left\">No prediction data.</p>";
        }

        if (futureForecastContainer) {
            futureForecastContainer.innerHTML = "";
        }

        clearFollowUps();
        renderReportContext(null);
    }

    function setLoading(nextLoading) {
        isLoading = nextLoading;

        if (loadingIndicator) {
            loadingIndicator.classList.toggle("hidden", !nextLoading);
        }

        sendButton.disabled = nextLoading;
        sendButton.textContent = nextLoading ? "Sending" : "Send";
        chatInput.readOnly = nextLoading;

        if (voiceButton && !voiceButton.dataset.unsupported) {
            voiceButton.disabled = nextLoading;
        }
    }

    function saveConversationState() {
        chatHistory = chatHistory.slice(-40);
        symptomTimeline = symptomTimeline.slice(-20);
        saveJSON(CHAT_STORAGE_KEY, chatHistory);
        saveJSON(TIMELINE_KEY, symptomTimeline);
    }

    function renderHistory() {
        chatMessages.innerHTML = "";
        chatHistory.forEach((entry) => {
            const bubble = addMessageBubble(entry.role === "user" ? "user" : "bot", entry.message, entry.meta);
            if (entry.role !== "user" && entry.meta?.risk_level) {
                renderMessageMeta(bubble, entry.meta);
            }
        });
    }

    function renderStoredAnalysis() {
        if (!latestChatAnalysis) {
            updateConfidenceUI(0);
            setRiskElement(explanationRisk, "Low");
            renderProbabilityChart([]);
            return;
        }

        updatePanels(latestChatAnalysis);
        updateEmergencyUI(latestChatAnalysis);
        updateUrgencyBadge(latestChatAnalysis);
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

    function formatTopThinking(items) {
        const validItems = getValidScores(items);

        if (!validItems.length) {
            return "";
        }

        return validItems
            .slice(0, 3)
            .map((item) => `${item.label} (${item.score}%)`)
            .join(", ");
    }

    function getConfidence(data) {
        const value = Number(data?.confidence);
        return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
    }

    function formatArray(value) {
        if (Array.isArray(value)) {
            return value.join(", ");
        }

        if (value && typeof value === "object") {
            return JSON.stringify(value);
        }

        return formatValue(value);
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

    function normalizeRisk(value) {
        const text = formatValue(value);
        return text === "-" ? "Unknown" : text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }

    function riskClass(value) {
        const risk = normalizeRisk(value).toLowerCase();

        if (["low", "medium", "high"].includes(risk)) {
            return risk;
        }

        return "neutral";
    }

    function scoreClass(score) {
        if (score >= 70) return "high";
        if (score >= 40) return "medium";
        return "low";
    }

    function setRiskElement(element, value) {
        if (!element) return;

        const risk = normalizeRisk(value);
        element.textContent = risk;
        element.className = `risk-chip ${riskClass(risk)}`;
    }

    function setText(element, value) {
        if (element) {
            element.textContent = value;
        }
    }

    function formatTime(value) {
        const date = new Date(value || Date.now());
        if (Number.isNaN(date.getTime())) return "Just now";
        return date.toLocaleString();
    }

    function scrollChatToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#039;");
    }

    function readJSON(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch {
            return fallback;
        }
    }

    function saveJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function initVoiceRecognition() {
        if (!voiceButton) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            voiceButton.dataset.unsupported = "true";
            voiceButton.disabled = true;
            voiceButton.classList.add("hidden");
            setVoiceStatus("Voice input is not supported in this browser.", "muted");
            return;
        }

        const recognition = new SpeechRecognition();
        let isListening = false;

        recognition.lang = "en-US";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        voiceButton.textContent = DEFAULT_VOICE_LABEL;
        voiceButton.setAttribute("aria-label", "Start voice input");

        voiceButton.addEventListener("click", () => {
            if (isLoading) return;

            if (isListening) {
                recognition.stop();
                return;
            }

            try {
                setVoiceListening(true);
                setVoiceStatus("Listening...", "active");
                recognition.start();
            } catch (error) {
                setVoiceListening(false);
                setVoiceStatus("Voice recognition is already active. Please try again in a moment.", "error");
            }
        });

        recognition.onstart = () => {
            isListening = true;
            setVoiceListening(true);
            setVoiceStatus("Listening...", "active");
        };

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results || [])
                .map((result) => result[0]?.transcript || "")
                .join(" ")
                .trim();

            if (transcript) {
                chatInput.value = transcript;
                chatInput.focus();
                setVoiceStatus("Voice captured. Review and send when ready.", "success");
            } else {
                setVoiceStatus("No speech detected. Try again.", "error");
            }
        };

        recognition.onerror = (event) => {
            setVoiceListening(false);
            setVoiceStatus(getVoiceErrorMessage(event.error), "error");
        };

        recognition.onend = () => {
            isListening = false;
            setVoiceListening(false);
        };

        function setVoiceListening(nextListening) {
            isListening = nextListening;
            voiceButton.classList.toggle("listening", nextListening);
            voiceButton.textContent = nextListening ? "Listening..." : DEFAULT_VOICE_LABEL;
            voiceButton.setAttribute("aria-pressed", String(nextListening));
        }
    }

    function getVoiceErrorMessage(errorName) {
        const messages = {
            "not-allowed": "Microphone permission was denied. Enable microphone access and try again.",
            "service-not-allowed": "Microphone permission was blocked by the browser.",
            "no-speech": "No speech detected. Try speaking a little closer to the microphone.",
            "audio-capture": "No microphone was found or audio capture failed.",
            "network": "Voice recognition network error. Please try again.",
            "aborted": "Voice input was stopped.",
            "language-not-supported": "Voice recognition does not support the selected language."
        };

        return messages[errorName] || "Voice recognition failed. Please try again.";
    }

    function setVoiceStatus(message, type = "") {
        if (!voiceStatus) return;

        voiceStatus.textContent = message;
        voiceStatus.className = `voice-status ${type}`.trim();
    }

    function initPdfExport() {
        if (!downloadPdfButton) return;

        downloadPdfButton.addEventListener("click", generateMedicalPdf);
    }

    function generateMedicalPdf() {
        const analysis = latestChatAnalysis || readJSON(CHAT_ANALYSIS_KEY, null);

        if (!analysis) {
            window.alert("No medical analysis available yet.");
            return;
        }

        if (!window.jspdf || !window.jspdf.jsPDF) {
            window.alert("PDF library is not loaded.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let y = 18;

        const addText = (text, indent = 0, size = 11) => {
            doc.setFontSize(size);
            const lines = doc.splitTextToSize(String(text || ""), 170 - indent);
            doc.text(lines, 20 + indent, y);
            y += lines.length * 7;
            y += 2;
        };

        doc.setFontSize(20);
        doc.text("MedIntel AI Medical Summary", 20, y);
        y += 12;

        addText(`Risk Level: ${analysis.risk_level || "Unknown"}`);
        addText(`Confidence: ${analysis.confidence || 0}%`);
        addText(`Primary Pattern: ${analysis.symptom_group || "Unknown"}`);
        addText(`Detected Symptoms: ${Array.isArray(analysis.detected_symptoms) ? analysis.detected_symptoms.join(", ") : "None"}`);

        y += 4;
        doc.setFontSize(14);
        doc.text("Top Predictions", 20, y);
        y += 8;

        (analysis.top_three_thinking || []).forEach((item) => {
            addText(`- ${item.label} (${item.score}%)`, 5);
        });

        y += 4;
        doc.setFontSize(14);
        doc.text("Recommendations", 20, y);
        y += 8;

        (analysis.recommendations || []).forEach((rec) => {
            addText(`- ${rec}`, 5);
        });

        if (analysis.emergency_alert) {
            y += 4;
            doc.setFontSize(14);
            doc.text("Emergency Warning", 20, y);
            y += 8;
            addText(analysis.emergency_message || "Emergency warning detected.", 5);
        }

        if (analysis.timeline_analysis) {
            y += 4;
            doc.setFontSize(14);
            doc.text("Timeline Analysis", 20, y);
            y += 8;
            addText(analysis.timeline_analysis, 5);
        }

        y += 4;
        doc.setFontSize(10);
        addText(analysis.disclaimer || "MedIntel AI-generated guidance only.");

        doc.save("MedIntel_AI_Report.pdf");
    }
});
