const {
    generateMedicalReasoning,
    generateFollowUpQuestion
} = require("../services/geminiService");
const sessionStore = new Map();

const DISCLAIMER =
  "This chatbot gives general health guidance only and is not a doctor replacement.";

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/fewer/gim, "fever")
    .replace(/bodypain/gim, "body pain")
    .replace(/head ache/gim, "headache")
    .replace(/vomting/gim, "vomiting")
    .replace(/diziness/gim, "dizziness")
    .replace(/breathing issue/gim, "breathing difficulty")
    .replace(/difficulty breathing/gim, "breathing difficulty")
    .replace(/short of breath/gim, "shortness of breath")
    .replace(/short breath/gim, "shortness of breath");
}

function createSession() {
  return {
    symptoms: [],
    severity: null,
    duration: null,
    progression: null,
    riskFactors: [],
    emergencySignals: [],
    completedQuestions: {
  symptoms: false,
  duration: false,
  severity: false,
  progression: false,
  cardiac: false,
  respiratory: false,
  gastro: false,
  neuro: false,
  associated: false
  
},
    timeline:[],
    followUpsAsked: [],
    history: [],
    reportContext: null,
    topPredictions: [],
    confidence: 0,
    riskLevel: "low",
    activeQuestion: null,
    updatedAt: new Date().toISOString()
  };
}

function getSession(sessionId) {
  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, createSession());
  }
  return sessionStore.get(sessionId);
}

function extractSymptoms(message) {
  const text = normalize(message);
  const symptoms = [];

  const symptomMap = [
    ["fever", ["fever"]],
    ["cough", ["cough"]],
    ["body pain", ["body pain", "body ache", "muscle pain"]],
    ["stomach pain", ["stomach pain", "abdominal pain", "belly pain", "stomach ache"]],
    ["nausea", ["nausea", "nauseous"]],
    ["chest pain", ["chest pain", "chest pressure", "chest tightness"]],
    ["breathing difficulty", ["breathing difficulty", "difficulty breathing", "shortness of breath", "short of breath", "breathless", "breathlessness", "hard to breathe"]],
    ["headache", ["headache", "head pain"]],
    ["dizziness", ["dizziness", "dizzy"]],
    ["weakness", ["weakness", "fatigue", "tired", "weak"]],
    ["vomiting", ["vomiting", "vomit"]],
    ["diarrhea", ["diarrhea", "loose motion"]],
    ["sweating", ["sweating", "sweaty", "cold sweat", "cold sweats"]],
    ["sore throat", ["sore throat"]],
    ["thirst", ["thirst", "very thirsty"]],
    ["urination", ["frequent urination", "urinating more"]],
    ["confusion", ["confusion", "confused"]],
    ["fainting", ["fainting", "passed out", "syncope"]],
    ["blurred vision", ["blurred vision", "double vision", "vision problem", "vision problems"]],
    ["palpitations", ["palpitations", "heart racing", "fast heartbeat", "rapid heartbeat"]],
    ["rash", ["rash", "hives", "itching"]],
    ["swelling", ["swelling", "puffed up"]]
  ];

  for (const [canonical, keywords] of symptomMap) {
    if (keywords.some((k) => text.includes(k))) {
      symptoms.push(canonical);
    }
  }

  return [...new Set(symptoms)];
}

function parseSeverity(message, options = {}) {
  const text = normalize(message);
  const allowBareNumber = Boolean(options.allowBareNumber);

  const numberMatch =
    text.match(/\b(10|[1-9])\s*(?:\/|out of)\s*10\b/);

  if (numberMatch) {
    const value = Number(numberMatch[1]);
    if (value >= 1 && value <= 10) return value;
  }

  if (/\b(unbearable|worst|extreme)\b/.test(text)) return 10;
  if (/\b(very bad|really bad|intense)\b/.test(text)) return 8;
  if (/\b(severe|serious)\b/.test(text)) return 8;
  if (/\b(moderate|medium)\b/.test(text)) return 5;
  if (/\b(mild|slight|minor)\b/.test(text)) return 3;
  if (/\b(bad|painful|strong)\b/.test(text)) return 6;

  const hasSeverityCue = /\b(severity|scale|pain|score|rating|level)\b/.test(text);
  const hasDurationCue = /\b(day|days|week|weeks|month|months|hour|hours|year|years)\b/.test(text);

  if ((allowBareNumber || hasSeverityCue) && !hasDurationCue) {
    const bareNumberMatch = text.match(/\b(10|[1-9])\b/);
    if (bareNumberMatch) {
      const value = Number(bareNumberMatch[1]);
      if (value >= 1 && value <= 10) return value;
    }
  }

  return null;
}

function parseDuration(message, options = {}) {
  const text = normalize(message);
  const match = text.match(/\b(?:for|since|last|past)?\s*(\d+)\s*(day|days|week|weeks|month|months|hour|hours|year|years)\b/);
  if (match) {
    return {
      value: Number(match[1]),
      unit: match[2],
      raw: `${match[1]} ${match[2]}`
    };
  }

  if (options.allowBareNumber && !text.match(/\b(10|[1-9])\s*(?:\/|out of)\s*10\b/)) {
    const bareNumberMatch = text.match(/\b(\d{1,3})\b/);
    if (bareNumberMatch) {
      const value = Number(bareNumberMatch[1]);
      if (value > 0) {
        return {
          value,
          unit: "days",
          raw: `${value} days`
        };
      }
    }
  }

  return null;
}

function parseProgression(message) {
  const text = normalize(message);
  if (text.includes("getting worse") || text.includes("worse")) return "worsening";
  if (text.includes("better") || text.includes("improving")) return "improving";
  if (text.includes("same") || text.includes("stable")) return "stable";
  return null;
}

function isYesAnswer(message) {
  const text = normalize(message);
  return /\b(yes|yeah|yep|sure|true|i do|i am|having|present)\b/.test(text);
}

function isNoAnswer(message) {
  const text = normalize(message);
  return /\b(no|nope|not|none|never|without|do not|don't|dont)\b/.test(text);
}

function addUnique(list, value) {
  if (!value) return;
  if (!list.includes(value)) {
    list.push(value);
  }
}

function completeQuestion(session, key) {
  if (!key) return;
  session.completedQuestions[key] = true;
  if (session.activeQuestion === key) {
    session.activeQuestion = null;
  }
}

function isQuestionCompleted(session, key) {
  if (!key) return false;
  if (key === "symptoms") {
    return Array.isArray(session.symptoms) && session.symptoms.length > 0;
  }
  return Boolean(session.completedQuestions[key]);
}

function getFollowUpKey(question) {
  const text = normalize(question);

  if (text.includes("how long")) return "duration";
  if (text.includes("1 to 10") || text.includes("severe")) return "severity";
  if (text.includes("getting worse") || text.includes("worse over time")) return "progression";
  if (text.includes("arm") || text.includes("jaw") || text.includes("back")) return "cardiac";
  if (text.includes("breathing difficulty")) return "respiratory";
  if (text.includes("fluids")) return "gastro";
  if (text.includes("blurred vision") || text.includes("confusion")) return "neuro";
  if (text.includes("symptom")) return "symptoms";

  return null;
}

function applyActiveQuestionAnswer(session, message) {
  const activeQuestion = session.activeQuestion;

  if (!activeQuestion) {
    return;
  }

  if (activeQuestion === "duration") {
    const duration = parseDuration(message, { allowBareNumber: true });
    if (duration) {
      session.duration = duration;
      completeQuestion(session, "duration");
    }
    return;
  }

  if (activeQuestion === "severity") {
    const severity = parseSeverity(message, { allowBareNumber: true });
    if (severity !== null) {
      session.severity = severity;
      completeQuestion(session, "severity");
    }
    return;
  }

  if (activeQuestion === "progression") {
    const progression = parseProgression(message);
    if (progression) {
      session.progression = progression;
      completeQuestion(session, "progression");
      return;
    }

    if (isYesAnswer(message)) {
      session.progression = "worsening";
      completeQuestion(session, "progression");
      return;
    }

    if (isNoAnswer(message)) {
      session.progression = "stable";
      completeQuestion(session, "progression");
    }
    return;
  }

  if (activeQuestion === "respiratory") {
    if (isYesAnswer(message) || extractSymptoms(message).includes("breathing difficulty")) {
      addUnique(session.symptoms, "breathing difficulty");
      completeQuestion(session, "respiratory");
      return;
    }

    if (isNoAnswer(message)) {
      completeQuestion(session, "respiratory");
    }
    return;
  }

  if (activeQuestion === "cardiac") {
    const text = normalize(message);
    if (isYesAnswer(message) || /\b(arm|jaw|back|shoulder|spread|radiat)\b/.test(text)) {
      addUnique(session.emergencySignals, "radiating chest pain");
      completeQuestion(session, "cardiac");
      return;
    }

    if (isNoAnswer(message)) {
      completeQuestion(session, "cardiac");
    }
    return;
  }

  if (activeQuestion === "gastro") {
    const text = normalize(message);
    if (isNoAnswer(message) || text.includes("can't keep") || text.includes("cannot keep") || text.includes("unable")) {
      addUnique(session.emergencySignals, "unable to keep fluids down");
      completeQuestion(session, "gastro");
      return;
    }

    if (isYesAnswer(message)) {
      completeQuestion(session, "gastro");
    }
    return;
  }

  if (activeQuestion === "neuro") {
    if (isYesAnswer(message) || extractSymptoms(message).some((s) => ["confusion", "blurred vision"].includes(s))) {
      addUnique(session.emergencySignals, "neurological warning answer");
      completeQuestion(session, "neuro");
      return;
    }

    if (isNoAnswer(message)) {
      completeQuestion(session, "neuro");
    }
  }
}

function extractRiskFactors(message) {
  const text = normalize(message);
  const factors = [];

  const items = [
    "diabetes",
    "asthma",
    "heart disease",
    "hypertension",
    "smoking",
    "pregnancy",
    "pregnant",
    "weak immunity"
  ];

  for (const item of items) {
    if (text.includes(item)) {
      factors.push(item);
    }
  }

  return [...new Set(factors)];
}

function updateSessionWithMessage(session, message) {
  const text = normalize(message);

  applyActiveQuestionAnswer(session, text);

  const newSymptoms = extractSymptoms(text);
  for (const s of newSymptoms) {
    addUnique(session.symptoms, s);
  }

  if (session.symptoms.length > 0) {
    completeQuestion(session, "symptoms");
  }

  const explicitDuration = parseDuration(text);
  if (explicitDuration) {
    session.duration = explicitDuration;
    completeQuestion(session, "duration");
  }

  const severity = parseSeverity(text);
  if (severity !== null) {
    session.severity = severity;
    completeQuestion(session, "severity");
  }

  const progression = parseProgression(text);
  if (progression) {
    session.progression = progression;
    completeQuestion(session, "progression");
  }

  const riskFactors = extractRiskFactors(text);
  for (const r of riskFactors) {
    addUnique(session.riskFactors, r);
  }

  if (
    session.symptoms.some((s) =>
      ["fever", "cough", "body pain", "headache", "weakness"].includes(s)
    )
  ) {
    completeQuestion(session, "associated");
  }

  session.history.push({
    role: "user",
    message,
    time: new Date().toISOString()
  });
  session.timeline.push({
  message,
  symptoms: [...session.symptoms],
  severity: session.severity,
  progression: session.progression,
  time: new Date().toISOString()
});
  session.updatedAt = new Date().toISOString();
}

function scoreConditions(session) {
  const symptoms = session.symptoms.map(normalize);

  const scores = [
    { label: "Viral / flu pattern", score: 0 },
    { label: "Respiratory pattern", score: 0 },
    { label: "Cardiac pattern", score: 0 },
    { label: "Metabolic / blood sugar pattern", score: 0 },
    { label: "Neurological pattern", score: 0 },
    { label: "Gastrointestinal pattern", score: 0 },
    { label: "Skin / allergy pattern", score: 0 }
  ];

  const has = (symptom) => symptoms.includes(symptom);

  if (has("fever")) scores[0].score += 25;
  if (has("cough")) scores[0].score += 20;
  if (has("body pain")) scores[0].score += 18;
  if (has("headache")) scores[0].score += 10;
  if (has("weakness")) scores[0].score += 10;
  if (has("sore throat")) scores[0].score += 10;

  if (has("cough")) scores[1].score += 20;
  if (has("breathing difficulty")) scores[1].score += 35;
  if (has("sore throat")) scores[1].score += 15;
  if (has("fever")) scores[1].score += 8;

  if (has("chest pain")) scores[2].score += 40;
  if (has("sweating")) scores[2].score += 15;
  if (has("breathing difficulty")) scores[2].score += 15;
  if (has("fainting")) scores[2].score += 20;
  if (has("dizziness")) scores[2].score += 8;
  if (has("palpitations")) scores[2].score += 20;

  if (has("thirst")) scores[3].score += 20;
  if (has("urination")) scores[3].score += 20;
  if (has("weakness")) scores[3].score += 10;

  if (session.riskFactors.includes("diabetes")) {
    scores[3].score += 15;
  }

  if (has("headache")) scores[4].score += 18;
  if (has("dizziness")) scores[4].score += 18;
  if (has("confusion")) scores[4].score += 30;
  if (has("fainting")) scores[4].score += 15;
  if (has("blurred vision")) scores[4].score += 18;

  if (has("vomiting")) scores[5].score += 30;
  if (has("diarrhea")) scores[5].score += 25;
  if (has("nausea")) scores[5].score += 15;
  if (has("stomach pain")) scores[5].score += 20;

  if (has("rash")) scores[6].score += 30;
  if (has("swelling")) scores[6].score += 24;
  if (has("breathing difficulty") && has("swelling")) scores[6].score += 25;

  if (has("fever") && has("cough") && has("body pain")) {
    scores[0].score += 15;
  }

  if (!has("chest pain") && !has("sweating") && !has("breathing difficulty") && !has("palpitations")) {
    scores[2].score -= 20;
  }

  if (session.symptoms.length && scores.every((item) => item.score <= 0)) {
    scores[0].score = Math.min(30, session.symptoms.length * 10);
  }

  for (const item of scores) {
    item.score = Math.max(0, Math.min(95, Math.round(item.score)));
  }

  scores.sort((a, b) => b.score - a.score);
  return scores;
}

function calculateRiskLevel(session) {

  const symptoms = session.symptoms;
  const emergencySignals = session.emergencySignals || [];
  const has = (s) => symptoms.includes(s);
  const hasSignal = (signal) => emergencySignals.includes(signal);

  // =====================================
  // HIGH EMERGENCY CASES
  // =====================================

  if (
    has("chest pain") &&
    (has("breathing difficulty") ||
      has("sweating") ||
      has("fainting") ||
      has("palpitations") ||
      hasSignal("radiating chest pain"))
  ) {
    return {
      level: "high",
      emergency: true,
      message:
        "Chest symptoms with warning signs can be serious. Please seek immediate medical attention."
    };
  }

  if (
    has("fainting") ||
    has("confusion") ||
    hasSignal("neurological warning answer")
  ) {
    return {
      level: "high",
      emergency: true,
      message:
        "Emergency neurological warning signs detected."
    };
  }

  if (
    has("breathing difficulty") &&
    ((session.severity || 0) >= 7 || has("swelling"))
  ) {
    return {
      level: "high",
      emergency: true,
      message:
        "Severe breathing difficulty can become urgent and needs prompt medical care."
    };
  }

  // =====================================
  // MEDIUM RISK
  // =====================================

  if (
    hasSignal("unable to keep fluids down") ||
    symptoms.includes("breathing difficulty") ||
    symptoms.includes("vomiting") ||
    symptoms.includes("diarrhea")
  ) {
    return {
      level: "medium",
      emergency: false,
      message:
        symptoms.includes("breathing difficulty")
          ? "Breathing symptoms should be monitored carefully."
          : "Monitor hydration and symptom progression carefully."
    };
  }

  if ((session.severity || 0) >= 7) {
    return {
      level: "medium",
      emergency: false,
      message:
        "Symptoms appear moderately severe."
    };
  }

  if (session.duration && session.duration.value >= 7) {
    return {
      level: "medium",
      emergency: false,
      message:
        "Symptoms have persisted long enough to consider medical review."
    };
  }

  if (session.progression === "worsening" && symptoms.length > 0) {
    return {
      level: "medium",
      emergency: false,
      message:
        "Symptoms are worsening and should be monitored carefully."
    };
  }

  // =====================================
  // LOW RISK
  // =====================================

  return {
    level: "low",
    emergency: false,
    message:
      "No emergency warning signs detected."
  };
}

function analyzeTimeline(session) {

  if (!session.timeline.length || !session.symptoms.length) {
    return null;
  }

  const latest =
    session.timeline[
      session.timeline.length - 1
    ];

  // worsening patterns

  if (
    latest.progression === "worsening"
  ) {
    return "Symptoms appear to be worsening over time.";
  }

  // improving patterns

  if (
    latest.progression === "improving"
  ) {
    return "Some symptoms appear to be improving.";
  }

  // long duration warning

  if (
    session.duration &&
    session.duration.value >= 7
  ) {
    return "Symptoms have continued for several days.";
  }

  return "Symptoms are currently stable.";
}

function generateRecommendations(session, topScores = []) {
  const symptoms = Array.isArray(session?.symptoms) ? session.symptoms : [];
  const symptomText = symptoms.join(" ").toLowerCase();
  const topLabel = (topScores[0]?.label || "").toLowerCase();

  const recommendations = [];
  const add = (text) => {
    if (!recommendations.includes(text)) {
      recommendations.push(text);
    }
  };

  const hasAny = (keywords) =>
    keywords.some((word) => topLabel.includes(word.toLowerCase()) || symptomText.includes(word.toLowerCase()));

  const hasRedFlags = () =>
    hasAny([
      "chest pain",
      "difficulty breathing",
      "breathing difficulty",
      "shortness of breath",
      "fainting",
      "unconscious",
      "severe weakness",
      "confusion",
      "blue lips",
      "blood in stool",
      "blood in vomit",
      "severe dehydration",
      "high fever",
      "seizure",
    ]);

  const rules = [
    {
      match: ["viral", "flu", "fever", "cold"],
      advice: [
        "Drink plenty of fluids to stay hydrated.",
        "Take adequate rest and avoid overexertion.",
        "Monitor fever, temperature, and overall weakness.",
        "Seek medical care if breathing difficulty, confusion, or worsening symptoms develop.",
      ],
    },
    {
      match: ["gastro", "stomach", "diarrhea", "vomit", "vomiting", "food poisoning"],
      advice: [
        "Stay hydrated with water or oral rehydration solution.",
        "Avoid oily, spicy, or heavy foods.",
        "Eat light and bland foods if tolerated.",
        "Seek medical care if vomiting continues, dehydration increases, or blood appears in stool or vomit.",
      ],
    },
    {
      match: ["cardiac", "heart", "chest pain", "palpitation"],
      advice: [
        "Avoid physical exertion.",
        "Seek immediate medical evaluation.",
        "Monitor chest discomfort, breathing, and dizziness closely.",
      ],
    },
    {
      match: ["respiratory", "asthma", "cough", "breath", "lung"],
      advice: [
        "Monitor breathing difficulty closely.",
        "Avoid smoke, dust, and polluted air.",
        "Rest in an upright position if breathing feels uncomfortable.",
        "Seek urgent care if breathing worsens or lips turn blue.",
      ],
    },
    {
      match: ["headache", "migraine"],
      advice: [
        "Rest in a quiet and dim environment.",
        "Stay hydrated and avoid skipping meals.",
        "Seek medical care if the headache is sudden, severe, or unusual.",
      ],
    },
    {
      match: ["skin", "rash", "itch", "allergy"],
      advice: [
        "Avoid scratching or irritants.",
        "Track whether the rash is spreading or associated with swelling.",
        "Seek medical help if swelling, breathing trouble, or rapid worsening appears.",
      ],
    },
  ];

  for (const rule of rules) {
    if (hasAny(rule.match)) {
      rule.advice.forEach(add);
    }
  }

  if (hasRedFlags()) {
    add("This may need urgent medical attention.");
    add("Go to emergency care immediately if symptoms are severe or rapidly worsening.");
  }

  if (recommendations.length === 0) {
    add("Monitor symptoms carefully.");
    add("Rest, hydrate, and track any change in symptoms.");
    add("Consult a healthcare professional if symptoms persist or worsen.");
  }

  return recommendations;
}


function detectEmergency(session) {

  const symptoms = session.symptoms;
  const emergencySignals = session.emergencySignals || [];

  const has = (s) => symptoms.includes(s);
  const hasSignal = (signal) => emergencySignals.includes(signal);

  // HEART EMERGENCY

  if (
    has("chest pain") &&
    (has("breathing difficulty") ||
      has("sweating") ||
      has("fainting") ||
      has("palpitations") ||
      hasSignal("radiating chest pain"))
  ) {
    return {
      emergency: true,
      message:
        "Chest pain with warning signs may require urgent medical care."
    };
  }

  // NEUROLOGICAL EMERGENCY

  if (
    has("confusion") ||
    has("fainting") ||
    hasSignal("neurological warning answer")
  ) {
    return {
      emergency: true,
      message:
        "Confusion or fainting can be serious and should be evaluated quickly."
    };
  }

  // SEVERE FEVER PATTERN

  if (
    has("fever") &&
    session.severity >= 9
  ) {
    return {
      emergency: true,
      message:
        "Very high severity fever symptoms may need urgent medical evaluation."
    };
  }

  // DEHYDRATION RISK

  if (
    has("vomiting") &&
    has("diarrhea") &&
    ((session.duration && session.duration.value >= 3) ||
      hasSignal("unable to keep fluids down"))
  ) {
    return {
      emergency: true,
      message:
        "Persistent vomiting and diarrhea may cause dehydration."
    };
  }

  if (has("breathing difficulty") && has("swelling")) {
    return {
      emergency: true,
      message:
        "Swelling with breathing difficulty can be urgent and should be assessed immediately."
    };
  }

  if (has("breathing difficulty") && (session.severity || 0) >= 8) {
    return {
      emergency: true,
      message:
        "Severe breathing difficulty should be assessed urgently."
    };
  }

  return {
    emergency: false,
    message: ""
  };
}


function buildDifferentialPredictions(primaryLabel) {
  if (primaryLabel === "Gastrointestinal pattern") {
    return [
      { label: "Possible viral gastroenteritis", score: 28 },
      { label: "Possible dehydration risk", score: 16 }
    ];
  }

  if (primaryLabel === "Viral / flu pattern") {
    return [
      { label: "Possible respiratory infection", score: 24 },
      { label: "Possible dehydration risk", score: 15 }
    ];
  }

  if (primaryLabel === "Respiratory pattern") {
    return [
      { label: "Possible viral/flu overlap", score: 22 },
      { label: "Possible allergy/irritation", score: 14 }
    ];
  }

  if (primaryLabel === "Cardiac pattern") {
    return [
      { label: "Possible respiratory overlap", score: 18 },
      { label: "Possible anxiety/stress overlap", score: 12 }
    ];
  }

  if (primaryLabel === "Neurological pattern") {
    return [
      { label: "Possible dehydration or weakness overlap", score: 18 },
      { label: "Possible migraine/headache pattern", score: 14 }
    ];
  }

  if (primaryLabel === "Metabolic / blood sugar pattern") {
    return [
      { label: "Possible dehydration overlap", score: 18 },
      { label: "Possible fatigue/weakness pattern", score: 14 }
    ];
  }

  if (primaryLabel === "Skin / allergy pattern") {
    return [
      { label: "Possible irritation or allergy pattern", score: 24 },
      { label: "Possible infection/inflammation overlap", score: 12 }
    ];
  }

  return [];
}

function computeConfidence(session, topScores) {
  if (!session.symptoms.length) {
    return 0;
  }

  let confidence = 35;

  confidence += session.symptoms.length * 5;
  if (session.severity !== null) confidence += 10;
  if (session.duration) confidence += 10;
  if (session.progression) confidence += 5;

  if (topScores.length >= 2) {
    const gap = topScores[0].score - topScores[1].score;
    if (gap >= 30) confidence += 15;
    else if (gap >= 15) confidence += 8;
  }

  return Math.min(95, Math.round(confidence));
}

function buildFollowUps(session) {

  const symptoms = session.symptoms;

  const questions = [];

  if (!symptoms.length) {
    return ["What symptoms are you noticing right now?"];
  }

  // =====================================
  // GENERAL QUESTIONS
  // =====================================

  if (!session.completedQuestions.duration) {
    questions.push("How long have you had these symptoms?");
  }

  if (!session.completedQuestions.severity) {
    questions.push("How severe is it from 1 to 10?");
  }

  // =====================================
  // CARDIAC FOLLOW UPS
  // =====================================

  if (
    symptoms.includes("chest pain") &&
    !session.completedQuestions.cardiac
  ) {
    questions.push(
      "Does the chest pain spread to your arm, back, or jaw?"
    );
  }

  // =====================================
  // RESPIRATORY FOLLOW UPS
  // =====================================

  if (
    symptoms.includes("cough") &&
    !symptoms.includes("breathing difficulty") &&
    !session.completedQuestions.respiratory
  ) {
    questions.push(
      "Are you having any breathing difficulty?"
    );
  }

  // =====================================
  // GASTRO FOLLOW UPS
  // =====================================

  if (
    symptoms.includes("vomiting") &&
    symptoms.includes("diarrhea") &&
    !session.completedQuestions.gastro
  ) {
    questions.push(
      "Are you able to drink and keep fluids down?"
    );
  }

  // =====================================
  // NEURO FOLLOW UPS
  // =====================================

  if (
    symptoms.includes("headache") &&
    symptoms.includes("dizziness") &&
    !session.completedQuestions.neuro
  ) {
    questions.push(
      "Do you also have blurred vision or confusion?"
    );
  }

  // =====================================
  // PROGRESSION
  // =====================================

  if (!session.completedQuestions.progression) {
    questions.push("Is it getting worse over time?");
  }

  return questions;
}

function filterNewFollowUps(session, questions) {
  const validQuestions = (questions || [])
    .filter(Boolean)
    .map((question) => String(question).trim())
    .filter(Boolean);

  if (!validQuestions.length) {
    session.activeQuestion = null;
    return [];
  }

  let selectedQuestion = null;

  if (session.activeQuestion && !isQuestionCompleted(session, session.activeQuestion)) {
    selectedQuestion =
      validQuestions.find((question) => getFollowUpKey(question) === session.activeQuestion) ||
      null;
  }

  if (!selectedQuestion) {
    selectedQuestion =
      validQuestions.find((question) => !isQuestionCompleted(session, getFollowUpKey(question))) ||
      validQuestions[0];
  }

  const selected = selectedQuestion ? [selectedQuestion] : [];

  if (selectedQuestion && !session.followUpsAsked.includes(selectedQuestion)) {
    session.followUpsAsked.push(selectedQuestion);
  }

  session.followUpsAsked = session.followUpsAsked.slice(-12);
  session.activeQuestion = selectedQuestion ? getFollowUpKey(selectedQuestion) : null;

  return selected;
}

function buildResponse(session, topScores, followUps) {
  const validScores = topScores.filter((s) => s.score > 0);
  const top1 = validScores[0];
  const top2 = validScores[1];
  const confidence = computeConfidence(session, validScores);
  const riskData = calculateRiskLevel(session);
  const emergencyResult = detectEmergency(session);
  const isEmergency = emergencyResult.emergency || riskData.emergency;
  const effectiveFollowUps = isEmergency ? [] : followUps;
  const recommendations =
  generateRecommendations(
    session,
    validScores
  );

  let top3 = validScores
    .slice(0, 3)
    .map((s) => ({
      label: s.label,
      score: s.score
    }));

  if (top3.length < 3) {
    const extras = buildDifferentialPredictions(top3[0]?.label || "");
    for (const item of extras) {
      if (!top3.some((x) => x.label === item.label)) {
        top3.push(item);
      }
    }
    top3 = top3.slice(0, 3);
  }

  let reply = "";
  const symptomText = session.symptoms.length
    ? session.symptoms.join(", ")
    : "";

  if (isEmergency) {
    reply = `${emergencyResult.message || riskData.message} Please seek urgent medical care now, especially if symptoms are active, severe, or worsening.`;
  } else if (effectiveFollowUps.length > 0) {
    reply = symptomText
      ? `I noticed ${symptomText}. One helpful detail would make this clearer: ${effectiveFollowUps[0]}`
      : `I still need a few symptom details. ${effectiveFollowUps[0]}`;
  } else if (top1) {
    const riskTone = riskData.level === "medium"
      ? "It would be wise to monitor this closely and seek medical advice if it worsens."
      : "This does not look like an emergency pattern right now, but keep watching for changes.";
    reply = `The strongest matching pattern is ${top1.label}. ${riskTone}`;
  } else {
    reply = "I still need a few symptom details before I can compare patterns safely.";
  }

  return {
    reply,
    followUps: effectiveFollowUps,
    confidence,
    top3,
    confidenceGap:
      top1 && top2
        ? `${top1.label} is ahead by ${top1.score - top2.score}% over ${top2.label}.`
        : top1
          ? `${top1.label} is the only clear pattern so far. More details can improve confidence.`
          : "I still need symptom details before comparing patterns.",
    symptomGroup: top1?.label || "Unclear",
    emergency: emergencyResult.emergency || riskData.emergency,
    emergencyMessage: emergencyResult.message || (riskData.emergency ? riskData.message : ""),
    riskLevel: riskData.level,
    riskMessage: emergencyResult.message || riskData.message,
    recommendations,
    timelineAnalysis: analyzeTimeline(session)
  };
}
function generateFutureForecast(session, result) {
  const symptoms = session.symptoms || [];
  const emergencySignals = session.emergencySignals || [];
  const severity = session.severity || 0;
  const durationDays = session.duration?.value || 0;
  const progression = session.progression || "stable";
  const riskLevel = result.riskLevel || "low";

  const forecast = {
    level: "low",
    title: "Symptoms appear stable for now.",
    next24h: [],
    next48h: [],
    next72h: [],
    warning: [],
  };

  const addUnique = (arr, text) => {
    if (!arr.includes(text)) arr.push(text);
  };

  const has = (symptom) => symptoms.includes(symptom);
  const hasSignal = (signal) => emergencySignals.includes(signal);

  if (!symptoms.length) {
    return forecast;
  }

  // =====================================
  // HIGH RISK / EMERGENCY
  // =====================================
  if (
    (has("chest pain") && (has("breathing difficulty") || has("sweating") || has("palpitations"))) ||
    has("fainting") ||
    has("confusion") ||
    hasSignal("radiating chest pain") ||
    hasSignal("neurological warning answer")
  ) {
    forecast.level = "high";
    forecast.title = "Urgent worsening risk detected.";
    addUnique(forecast.next24h, "Symptoms may worsen quickly without medical evaluation.");
    addUnique(forecast.next24h, "Urgent medical care is recommended.");
    addUnique(forecast.next48h, "Delay in treatment may increase risk.");
    addUnique(forecast.warning, "Seek immediate emergency care.");
    return forecast;
  }

  // =====================================
  // RESPIRATORY FORECAST
  // =====================================
  if (has("cough") || has("breathing difficulty") || has("sore throat")) {
    forecast.level = riskLevel === "medium" ? "medium" : forecast.level;
    forecast.title = "Respiratory symptoms should be monitored closely.";

    addUnique(
      forecast.next24h,
      "Breathing discomfort may persist or become more noticeable."
    );
    addUnique(
      forecast.next48h,
      "Cough or throat irritation may continue if the underlying cause is not improving."
    );
    addUnique(
      forecast.next72h,
      "If fever or breathing difficulty increases, medical evaluation should be considered."
    );
  }

  // =====================================
  // FEVER / VIRAL FORECAST
  // =====================================
  if (has("fever") || has("body pain")) {
    forecast.level = severity >= 7 ? "medium" : forecast.level;
    forecast.title = "Viral or flu-like symptoms may evolve over the next days.";

    addUnique(
      forecast.next24h,
      "Fever and body pain may remain similar or worsen if the infection progresses."
    );
    addUnique(
      forecast.next48h,
      "Weakness, fatigue, and reduced appetite may increase if rest and hydration are poor."
    );
    addUnique(
      forecast.next72h,
      "If fever stays high for several days, further medical review may be needed."
    );
  }

  // =====================================
  // GASTRO FORECAST
  // =====================================
  if (has("vomiting") || has("diarrhea") || has("nausea") || has("stomach pain")) {
    forecast.level = "medium";
    forecast.title = "Digestive symptoms may increase dehydration risk.";

    addUnique(
      forecast.next24h,
      "Ongoing vomiting or diarrhea may reduce fluid levels."
    );
    addUnique(
      forecast.next48h,
      "Dehydration risk may increase if oral fluids are not maintained."
    );
    addUnique(
      forecast.next72h,
      "If symptoms continue beyond 2-3 days, medical assessment may be necessary."
    );
    addUnique(
      forecast.warning,
      "Watch for dry mouth, dizziness, dark urine, or weakness."
    );
  }

  // =====================================
  // CARDIAC FORECAST
  // =====================================
  if (has("chest pain") || has("sweating")) {
    forecast.level = "high";
    forecast.title = "Cardiac-related symptoms need close monitoring.";

    addUnique(
      forecast.next24h,
      "Chest discomfort may become more concerning if it spreads or becomes more frequent."
    );
    addUnique(
      forecast.next48h,
      "Breathing difficulty, sweating, or dizziness may indicate worsening risk."
    );
    addUnique(
      forecast.warning,
      "Do not delay medical evaluation if symptoms worsen."
    );
  }

  // =====================================
  // DURATION / PROGRESSION
  // =====================================
  if (durationDays >= 3) {
    addUnique(
      forecast.next48h,
      "Symptoms lasting several days may need medical review if they are not improving."
    );
  }

  if (durationDays >= 7) {
    forecast.level = forecast.level === "low" ? "medium" : forecast.level;
    addUnique(
      forecast.next72h,
      "Persistent symptoms for a week or more may require formal medical assessment."
    );
  }

  if (progression === "worsening") {
    forecast.level = "high";
    addUnique(
      forecast.warning,
      "Because symptoms are worsening, the chance of escalation is higher."
    );
    addUnique(
      forecast.next24h,
      "Symptoms may intensify faster than usual."
    );
  }

  if (progression === "improving") {
    forecast.title = "Symptoms appear to be improving.";
    addUnique(
      forecast.next24h,
      "Recovery may continue if rest, hydration, and care are maintained."
    );
  }

  if (forecast.warning.length === 0) {
    addUnique(
      forecast.warning,
      "Continue monitoring symptoms and seek care if they worsen."
    );
  }

  return forecast;
}
exports.askChatbot = async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    const sessionId = String(req.body?.sessionId || "default-session");
    const selectedReportContext =
      req.body?.selectedReportContext && typeof req.body.selectedReportContext === "object"
        ? req.body.selectedReportContext
        : null;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "message is required",
      });
    }

    const session = getSession(sessionId);

    if (selectedReportContext) {
      session.reportContext = selectedReportContext;
    }

    updateSessionWithMessage(session, message);

    const topScores = scoreConditions(session);
    const followUps = filterNewFollowUps(session, buildFollowUps(session));

    const result = buildResponse(session, topScores, followUps);
    const responseFollowUps = result.followUps || [];
    if (result.emergency) {
      session.activeQuestion = null;
    }
    const futureForecast = generateFutureForecast(session, result);

    const aiReasoning = await generateMedicalReasoning({
      symptoms: session.symptoms,
      topPattern: result.symptomGroup,
      topPredictions: result.top3,
      riskLevel: result.riskLevel,
      emergency: result.emergency,
      emergencyMessage: result.emergencyMessage,
      recommendations: result.recommendations,
      followUpQuestion: responseFollowUps[0] || "",
      duration: session.duration,
      severity: session.severity,
      progression: session.progression,
      reportContext: session.reportContext,
    });

    const aiFollowUp = responseFollowUps.length
      ? await generateFollowUpQuestion({
          symptoms: session.symptoms,
          topPattern: result.symptomGroup,
          riskLevel: result.riskLevel,
        })
      : null;

    session.topPredictions = result.top3;
    session.confidence = result.confidence;
    session.riskLevel = result.riskLevel;

    const symptomExplanation = session.symptoms.length
      ? `Detected symptoms: ${session.symptoms.join(", ")}.`
      : "I still need a few symptom details.";

    session.history.push({
      role: "assistant",
      message: aiReasoning || result.reply,
      time: new Date().toISOString(),
    });

    return res.json({
      success: true,
      reply: aiReasoning || result.reply,
      aiReasoning,
      aiFollowUp,
      futureForecast,
      follow_up_needed: responseFollowUps.length > 0,
      follow_up_questions: responseFollowUps,
      detected_symptoms: session.symptoms,
      symptom_group: result.symptomGroup,
      top_three_thinking: result.top3,
      confidence_gap_analysis: {
        message: result.confidenceGap,
      },
      recommendations: result.recommendations,
      emergency_alert: result.emergency,
      emergency_message: result.emergencyMessage,
      risk_level: result.riskLevel,
      risk_message: result.riskMessage,
      report_context: session.reportContext,
      confidence: result.confidence,
      timeline_analysis: analyzeTimeline(session),
      summary: result.top3[0]
        ? `Current strongest pattern: ${result.top3[0].label}.`
        : "More context is needed.",
      explanation: session.symptoms.length
        ? `${symptomExplanation} ${result.confidenceGap}`
        : symptomExplanation,
      disclaimer: DISCLAIMER,
    });
  } catch (error) {
    console.error("Chatbot error:", error);

    return res.status(500).json({
      success: false,
      message: "Chatbot Error",
      error: error.message,
    });
  }
};
