let GoogleGenerativeAI = null;

try {
  ({ GoogleGenerativeAI } = require("@google/generative-ai"));
} catch (error) {
  console.warn("Gemini SDK is not installed. AI enhancement will use local fallback responses.");
}

const genAI = GoogleGenerativeAI && process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

function getModel() {
  if (!genAI || !process.env.GEMINI_API_KEY) {
    return null;
  }

  return genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
  });
}

async function generateMedicalReasoning(data) {
  try {
    const model = getModel();

    if (!model) {
      return null;
    }

    const reportContext = data.reportContext
      ? `\nRecent report context:\nType: ${data.reportContext.report_type || "Unknown"}\nRisk: ${data.reportContext.risk_level || "Unknown"}\nSummary: ${data.reportContext.summary || "No summary"}\n`
      : "";

    const symptoms = Array.isArray(data.symptoms) ? data.symptoms.filter(Boolean) : [];
    const topPredictions = Array.isArray(data.topPredictions)
      ? data.topPredictions
          .filter((item) => item && item.label && Number(item.score) > 0)
          .slice(0, 3)
          .map((item) => `${item.label} (${Math.round(item.score)}%)`)
          .join(", ")
      : "";
    const recommendations = Array.isArray(data.recommendations)
      ? data.recommendations.filter(Boolean).slice(0, 4).join("; ")
      : "";
    const contextLines = [
      data.duration?.raw ? `Duration: ${data.duration.raw}` : "",
      data.severity !== null && data.severity !== undefined ? `Severity: ${data.severity}/10` : "",
      data.progression ? `Progression: ${data.progression}` : "",
    ].filter(Boolean).join("\n");

    const prompt = `
You are the personality layer for an AI healthcare analyzer. The app has already calculated symptoms, risk, and pattern scores with a local medical engine. Use that engine output as the source of truth.

Voice:
- Calm, empathetic, and human.
- Low risk: reassuring but still cautious.
- Medium risk: careful, informative, and practical.
- High risk or emergency: serious, direct, and medically responsible.
- Do not sound casual during emergencies.
- Do not diagnose or claim certainty.
- Do not mention that you are a language model.
- Avoid repetitive phrases such as "To refine this safely".

Detected symptoms:
${symptoms.join(", ") || "none"}

Top pattern:
${data.topPattern || "Unknown"}

Top scored patterns:
${topPredictions || "No scored pattern yet"}

Risk level:
${data.riskLevel || "low"}

Emergency:
${data.emergency ? "Yes" : "No"}
${data.emergencyMessage ? `Emergency message: ${data.emergencyMessage}` : ""}
${data.followUpQuestion ? `Follow-up question to ask: ${data.followUpQuestion}` : ""}
${contextLines ? `\nSession context:\n${contextLines}` : ""}
${recommendations ? `\nApp recommendations:\n${recommendations}` : ""}
${reportContext}

Write one concise response under 115 words.
If no symptoms are detected, ask for symptom details instead of inventing medical reasoning.
If emergency is Yes, start with a clear urgent-care instruction and keep the wording serious.
If a follow-up question is provided and emergency is No, end with that question in natural wording.
Otherwise, explain what the pattern suggests, give 2-3 safe next steps, and include when to seek care.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    return text || null;
  } catch (error) {
    console.error("Gemini reasoning error:", error.message);
    return null;
  }
}

async function generateFollowUpQuestion(data) {
  try {
    const model = getModel();

    if (!model) {
      return null;
    }

    const symptoms = Array.isArray(data.symptoms) ? data.symptoms.filter(Boolean) : [];

    const prompt = `
You are an empathetic AI healthcare guide.

Detected symptoms:
${symptoms.join(", ") || "none"}

Top pattern:
${data.topPattern || "Unknown"}

Risk level:
${data.riskLevel || "low"}

Generate ONLY ONE important medical follow-up question.
Rules:
- Ask in natural, supportive wording.
- Keep it short and medically useful.
- Ask for the missing detail that would most improve safety.
- Do not repeat generic phrasing.
- Return only the question.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    return text || null;
  } catch (error) {
    console.error("Gemini follow-up error:", error.message);
    return null;
  }
}
async function generateReportInsights(
    medicalAnalysis
) {

    try {

        const model =
            getModel();

        if (!model) {
            return null;
        }

        const formatted =
            medicalAnalysis
                .map(item =>
                    `
${item.test}
Value: ${item.value}
Status: ${item.status}
Explanation: ${item.explanation}
`
                )
                .join("\n");

        const prompt = `
You are a careful, empathetic AI medical assistant summarizing report findings. Do not diagnose. Use plain language and keep safety guidance medically responsible.

Analyze these medical report findings.

${formatted}

Provide:
1. Medical interpretation
2. Possible health meaning
3. Simple explanation
4. Basic precautions

Keep response under 150 words.
`;

        const result =
            await model.generateContent(
                prompt
            );

        const response =
            await result.response;

        return response
            .text()
            .trim();

    } catch (error) {

        console.log(
            "Gemini Report Insight Error:",
            error.message
        );

        return null;
    }
}

module.exports = {
    generateMedicalReasoning,
    generateFollowUpQuestion,
    generateReportInsights
};

