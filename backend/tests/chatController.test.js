const test = require("node:test");
const assert = require("node:assert/strict");

const { _test } = require("../controllers/chatController");

test("extracts sweating alone as low risk without cardiac pattern", () => {
  const analysis = _test.analyzeSymptomMessage("I have excessive sweating");

  assert.deepEqual(analysis.detected_symptoms, ["sweating"]);
  assert.equal(analysis.risk_level, "low");
  assert.equal(analysis.cardiac_pattern, false);
  assert.equal(analysis.emergency_alert, false);
});

test("extracts chest pain alone as medium risk", () => {
  const analysis = _test.analyzeSymptomMessage("I have chest pain");

  assert.deepEqual(analysis.detected_symptoms, ["chest pain"]);
  assert.equal(analysis.risk_level, "medium");
});

test("extracts chest pain with shortness of breath as high risk", () => {
  const analysis = _test.analyzeSymptomMessage("I have chest pain and shortness of breath");

  assert.deepEqual(analysis.detected_symptoms, ["chest pain", "shortness of breath"]);
  assert.equal(analysis.risk_level, "high");
});

test("extracts metabolic symptoms as medium blood sugar pattern", () => {
  const analysis = _test.analyzeSymptomMessage(
    "I feel very thirsty, frequent urination, fatigue, and blurred vision"
  );

  assert.deepEqual(analysis.detected_symptoms, [
    "thirst",
    "frequent urination",
    "fatigue",
    "blurred vision"
  ]);
  assert.equal(analysis.symptom_group, "Metabolic / Blood Sugar");
  assert.equal(analysis.risk_level, "medium");
});
