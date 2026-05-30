import json
import os
import re
import sys

# OCR notes:
# - PDF text extraction uses PyPDF2.
# - Image OCR uses Pillow + pytesseract when installed.
# - Optional PDF OCR fallback uses PyMuPDF + pytesseract when installed.
# Install examples:
#   pip install PyPDF2 Pillow pytesseract PyMuPDF
# Tesseract OCR must also be installed on the system for pytesseract to work.

try:
    from PyPDF2 import PdfReader
    PYPDF2_AVAILABLE = True
except ImportError:
    PYPDF2_AVAILABLE = False

try:
    from PIL import Image, ImageOps, ImageFilter
    import pytesseract
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False

try:
    import fitz
    PDF_OCR_AVAILABLE = True
except ImportError:
    PDF_OCR_AVAILABLE = False


def json_exit(payload, code=0):
    print(json.dumps(payload))
    sys.exit(code)


def read_pdf_text(path):
    if not PYPDF2_AVAILABLE:
        json_exit({
            "status": "error",
            "message": "PyPDF2 is not installed. Run: pip install PyPDF2"
        }, 1)

    try:
        reader = PdfReader(path)
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        json_exit({
            "status": "error",
            "message": f"Failed to read PDF: {exc}"
        }, 1)


def preprocess_image(image):
    image = image.convert("L")
    image = ImageOps.autocontrast(image)
    image = image.filter(ImageFilter.SHARPEN)
    width, height = image.size

    if width < 1400:
        scale = 1400 / max(width, 1)
        image = image.resize((int(width * scale), int(height * scale)))

    return image


def ocr_image_path(path):
    if not OCR_AVAILABLE:
        json_exit({
            "status": "error",
            "message": "Image OCR is not installed. Install Pillow, pytesseract, and the Tesseract OCR app, or upload a text-based PDF."
        }, 1)

    try:
        image = preprocess_image(Image.open(path))
        return pytesseract.image_to_string(image)
    except Exception as exc:
        json_exit({
            "status": "error",
            "message": f"Failed to OCR image report: {exc}"
        }, 1)


def ocr_pdf_pages(path):
    if not (OCR_AVAILABLE and PDF_OCR_AVAILABLE):
        return "", False

    try:
        document = fitz.open(path)
        chunks = []

        for page in document:
            pixmap = page.get_pixmap(dpi=180)
            image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
            chunks.append(pytesseract.image_to_string(preprocess_image(image)))

        return "\n".join(chunks), True
    except Exception:
        return "", False


def read_text_file(path):
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as file:
            return file.read()
    except Exception as exc:
        json_exit({
            "status": "error",
            "message": f"Failed to read text file: {exc}"
        }, 1)


def clean_text(value):
    value = value.lower()
    value = value.replace("\u2013", "-").replace("\u2014", "-")
    return re.sub(r"\s+", " ", value).strip()


def contains_keyword(text, keyword):
    if " " in keyword:
        return keyword in text

    return re.search(rf"\b{re.escape(keyword)}\b", text) is not None


def has_any(text, keywords):
    return any(contains_keyword(text, keyword) for keyword in keywords)


def add_unique(items, value):
    if value and value not in items:
        items.append(value)


def find_marker_value(text, markers):
    for marker in markers:
        marker_pattern = re.escape(marker).replace("\\ ", r"\s+")
        pattern = rf"\b{marker_pattern}\b[^0-9]{{0,50}}(\d+(?:\.\d+)?)"
        match = re.search(pattern, text)
        if match:
            return float(match.group(1))
    return None


def phrase_near_marker(text, markers, phrases, distance=90):
    for marker in markers:
        marker_pattern = re.escape(marker).replace("\\ ", r"\s+")
        for match in re.finditer(rf"\b{marker_pattern}\b", text):
            start = max(match.start() - distance, 0)
            end = min(match.end() + distance, len(text))
            window = text[start:end]
            if any(phrase in window for phrase in phrases):
                return True
    return False


def list_text(items, fallback):
    if not items:
        return fallback
    return "; ".join(items)


def build_summary(report_types, risk_level, findings, recommendations):
    report_label = ", ".join(report_types) if report_types else "general"
    finding_text = list_text(findings, "no major abnormal findings were detected from the extracted text")
    recommendation_text = list_text(recommendations, "continue routine follow-up and healthy lifestyle habits")

    return (
        f"This appears to be a {report_label} report. The overall risk level is {risk_level}. "
        f"Key findings: {finding_text}. Suggested next steps: {recommendation_text}."
    )


def build_simple_explanation(report_types, risk_level, findings):
    report_label = ", ".join(report_types) if report_types else "medical"
    if risk_level == "HIGH":
        tone = "Some values or phrases in the report need prompt medical attention."
    elif risk_level == "MEDIUM":
        tone = "Some markers should be reviewed and monitored."
    else:
        tone = "The extracted text does not show a strong warning pattern."

    finding_text = list_text(findings, "no specific abnormal marker was identified")
    return f"In simple words, this {report_label} report was read by the analyzer and {finding_text}. {tone}"


def calculate_confidence(text, report_types, findings, ocr_used):
    score = 0.45
    if len(text) > 80:
        score += 0.15
    if report_types and "general" not in report_types:
        score += 0.18
    if findings:
        score += 0.16
    if ocr_used:
        score -= 0.08
    return round(max(0.2, min(score, 0.95)), 2)


if len(sys.argv) < 2:
    json_exit({
        "status": "error",
        "message": "No file path provided. Usage: python analyze_report.py <file_path>"
    }, 1)

file_path = sys.argv[1]

if not os.path.exists(file_path):
    json_exit({
        "status": "error",
        "message": f"File not found: {file_path}"
    }, 1)

file_ext = os.path.splitext(file_path)[1].lower()
ocr_used = False

if file_ext == ".pdf":
    extracted_text = read_pdf_text(file_path)

    if len(clean_text(extracted_text)) < 40:
        ocr_text, did_ocr = ocr_pdf_pages(file_path)
        if did_ocr and len(clean_text(ocr_text)) > len(clean_text(extracted_text)):
            extracted_text = ocr_text
            ocr_used = True
elif file_ext == ".txt":
    extracted_text = read_text_file(file_path)
elif file_ext in [".jpg", ".jpeg", ".png"]:
    extracted_text = ocr_image_path(file_path)
    ocr_used = True
else:
    json_exit({
        "status": "error",
        "message": f"Unsupported file type: {file_ext}. Use PDF, TXT, JPG, JPEG, or PNG."
    }, 1)

if not extracted_text.strip():
    json_exit({
        "status": "error",
        "message": "No text could be extracted from the file. The PDF may be scanned or image-based."
    }, 1)

text = clean_text(extracted_text)

response = {
    "status": "success",
    "uploaded_file": file_path,
    "report_type": [],
    "risk_level": "LOW",
    "summary": "",
    "simplified_explanation": "",
    "findings": [],
    "recommendations": [],
    "precautions": [],
    "emergency_alert": False,
    "disclaimer": "This MedIntel AI summary is for education only and is not a replacement for a qualified doctor.",
    "extracted_text": extracted_text.strip(),
    "extracted_text_preview": extracted_text.strip()[:700],
    "ocr_used": ocr_used,
    "confidence": 0.0
}

detected_types = []
risk_score = 0

diabetes_keywords = [
    "diabetes", "glucose", "blood sugar", "hba1c", "a1c", "insulin",
    "fasting sugar", "fasting glucose", "fbs", "rbs", "sugar intake"
]
heart_keywords = [
    "cholesterol", "ecg", "troponin", "angina", "heart rate",
    "chest pain", "cardiac", "ldl", "hdl"
]
liver_keywords = [
    "bilirubin", "albumin", "alkaline phosphatase", "sgpt", "sgot",
    "liver function", "lft", "alt", "ast"
]
cbc_keywords = [
    "hemoglobin", "wbc", "rbc", "platelet", "hematocrit", "mcv", "mch",
    "white blood cell", "red blood cell"
]

if has_any(text, diabetes_keywords):
    detected_types.append("diabetes")
if has_any(text, heart_keywords):
    detected_types.append("heart")
if has_any(text, liver_keywords):
    detected_types.append("liver")
if has_any(text, cbc_keywords):
    detected_types.append("cbc")
if not detected_types:
    detected_types.append("general")

response["report_type"] = detected_types

if "diabetes" in detected_types:
    glucose_markers = [
        "fasting glucose", "fasting blood sugar", "blood glucose",
        "blood sugar", "random glucose", "glucose", "fbs", "rbs"
    ]
    glucose_value = find_marker_value(text, glucose_markers)
    hba1c_value = find_marker_value(text, ["hba1c", "a1c"])
    elevated_text = phrase_near_marker(
        text,
        glucose_markers,
        ["high", "elevated", "increased", "abnormal", "hyperglycemia"]
    ) or "glucose levels are elevated" in text

    if elevated_text:
        add_unique(response["findings"], "Elevated glucose level detected")
        add_unique(response["recommendations"], "Avoid excess sugar and refined carbohydrates")
        add_unique(response["recommendations"], "Monitor blood glucose regularly")
        add_unique(response["recommendations"], "Exercise daily for at least 30 minutes")
        add_unique(response["recommendations"], "Consult a doctor or diabetologist for review")
        risk_score += 65

    if glucose_value is not None:
        if glucose_value >= 200:
            add_unique(response["findings"], f"Very high glucose value detected: {glucose_value:g}")
            add_unique(response["recommendations"], "Seek medical advice promptly for high glucose control")
            risk_score += 75
        elif glucose_value >= 126:
            add_unique(response["findings"], f"High glucose value detected: {glucose_value:g}")
            add_unique(response["recommendations"], "Reduce sugar intake and repeat glucose testing as advised")
            risk_score += 55
        elif glucose_value >= 100:
            add_unique(response["findings"], f"Borderline glucose value detected: {glucose_value:g}")
            add_unique(response["recommendations"], "Maintain diet control and monitor glucose trends")
            risk_score += 25
        else:
            add_unique(response["findings"], f"Glucose value detected: {glucose_value:g}")

    if hba1c_value is not None:
        if hba1c_value >= 6.5:
            add_unique(response["findings"], f"High HbA1c value detected: {hba1c_value:g}%")
            add_unique(response["recommendations"], "Discuss HbA1c control and treatment plan with your doctor")
            risk_score += 60
        elif hba1c_value >= 5.7:
            add_unique(response["findings"], f"Borderline HbA1c value detected: {hba1c_value:g}%")
            add_unique(response["recommendations"], "Improve diet, exercise, and repeat HbA1c testing as advised")
            risk_score += 30
        else:
            add_unique(response["findings"], f"HbA1c value detected: {hba1c_value:g}%")

    if contains_keyword(text, "insulin"):
        add_unique(response["findings"], "Insulin-related information detected")
        add_unique(response["recommendations"], "Monitor insulin levels as advised by your physician")
        risk_score += 10

    if not response["findings"]:
        add_unique(response["findings"], "Diabetes-related report detected")
        add_unique(response["recommendations"], "Continue regular blood sugar monitoring")
        add_unique(response["recommendations"], "Maintain a balanced low-sugar diet")
        add_unique(response["recommendations"], "Exercise regularly and follow up with your doctor")

if "heart" in detected_types:
    cholesterol_value = find_marker_value(text, ["total cholesterol", "cholesterol"])
    ldl_value = find_marker_value(text, ["ldl"])

    if contains_keyword(text, "cholesterol"):
        add_unique(response["findings"], "Cholesterol marker detected")
        add_unique(response["recommendations"], "Reduce saturated fats and processed foods")
        risk_score += 20

    if cholesterol_value is not None and cholesterol_value >= 240:
        add_unique(response["findings"], f"High total cholesterol value detected: {cholesterol_value:g}")
        add_unique(response["recommendations"], "Review cholesterol control with a doctor")
        risk_score += 35

    if ldl_value is not None and ldl_value >= 160:
        add_unique(response["findings"], f"High LDL value detected: {ldl_value:g}")
        add_unique(response["recommendations"], "Ask your doctor about LDL reduction strategies")
        risk_score += 35

    if "chest pain" in text or contains_keyword(text, "angina"):
        add_unique(response["findings"], "Chest pain or angina symptom mentioned")
        add_unique(response["recommendations"], "Seek immediate cardiac evaluation")
        response["emergency_alert"] = True
        risk_score += 50

    if contains_keyword(text, "ecg") or contains_keyword(text, "troponin"):
        add_unique(response["findings"], "Cardiac marker detected")
        add_unique(response["recommendations"], "Consult a cardiologist for further evaluation")
        risk_score += 25

    add_unique(response["recommendations"], "Walk daily for at least 30 minutes if approved by your doctor")

if "liver" in detected_types:
    if contains_keyword(text, "bilirubin"):
        add_unique(response["findings"], "Bilirubin marker detected")
        add_unique(response["recommendations"], "Avoid alcohol and follow a liver-friendly diet")
        risk_score += 20

    if contains_keyword(text, "alt") or contains_keyword(text, "sgpt"):
        add_unique(response["findings"], "ALT/SGPT liver enzyme marker detected")
        add_unique(response["recommendations"], "Repeat liver function tests as advised")
        risk_score += 15

    if contains_keyword(text, "ast") or contains_keyword(text, "sgot"):
        add_unique(response["findings"], "AST/SGOT liver enzyme marker detected")
        add_unique(response["recommendations"], "Consult a gastroenterologist if values are elevated")
        risk_score += 15

if "cbc" in detected_types:
    if contains_keyword(text, "hemoglobin"):
        add_unique(response["findings"], "Hemoglobin level detected")
        add_unique(response["recommendations"], "Ensure adequate iron and B12 intake")
        risk_score += 10

    if contains_keyword(text, "platelet"):
        add_unique(response["findings"], "Platelet count detected")
        add_unique(response["recommendations"], "Monitor for unusual bruising or bleeding")
        risk_score += 8

    if contains_keyword(text, "wbc") or "white blood cell" in text:
        add_unique(response["findings"], "White blood cell count detected")
        add_unique(response["recommendations"], "Watch for signs of infection or immune issues")
        risk_score += 8

if "general" in detected_types:
    add_unique(response["findings"], "General medical report detected")
    add_unique(response["recommendations"], "Maintain a healthy lifestyle")
    add_unique(response["recommendations"], "Schedule regular check-ups with your physician")

if any(term in text for term in ["severe chest pain", "difficulty breathing", "fainting", "stroke", "heart attack"]):
    response["emergency_alert"] = True
    add_unique(response["recommendations"], "Seek urgent medical care if symptoms are active or worsening")
    risk_score += 60

if risk_score >= 60:
    response["risk_level"] = "HIGH"
elif risk_score >= 30:
    response["risk_level"] = "MEDIUM"
else:
    response["risk_level"] = "LOW"

response["precautions"] = list(dict.fromkeys(response["recommendations"][:4]))
response["summary"] = build_summary(
    response["report_type"],
    response["risk_level"],
    response["findings"],
    response["recommendations"]
)
response["simplified_explanation"] = build_simple_explanation(
    response["report_type"],
    response["risk_level"],
    response["findings"]
)
response["confidence"] = calculate_confidence(
    text,
    response["report_type"],
    response["findings"],
    response["ocr_used"]
)

json_exit(response)
