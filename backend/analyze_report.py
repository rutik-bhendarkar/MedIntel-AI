import json
import os
import re
import sys
import traceback
from pathlib import Path

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
    out = json.dumps(payload)
    # print machine-readable output to stdout (used by caller)
    print(out)

    # Also emit the error payload to stderr when exiting with non-zero code
    # so that external process supervisors (like Node/Render) capture the message
    if code and code != 0:
        try:
            print(out, file=sys.stderr)
        except Exception:
            pass

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


PROJECT_DIR = Path(__file__).resolve().parent


def main():
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

    try:
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
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        json_exit({"status": "error", "message": f"Failed to extract text: {exc}"}, 1)

    if not extracted_text.strip():
        json_exit({
            "status": "error",
            "message": "No text could be extracted from the file. The PDF may be scanned or image-based."
        }, 1)

    text = clean_text(extracted_text)

    # Simple detection using existing helper functions
    diabetes_keywords = [
        "diabetes", "glucose", "blood sugar", "hba1c", "a1c", "insulin",
    ]
    heart_keywords = ["cholesterol", "ecg", "troponin", "angina", "chest pain"]
    liver_keywords = ["bilirubin", "alt", "ast", "liver"]
    cbc_keywords = ["hemoglobin", "wbc", "rbc", "platelet"]

    detected_types = []
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

    # Basic risk scoring
    risk_score = 0
    if "diabetes" in detected_types:
        risk_score += 40
    if "heart" in detected_types:
        risk_score += 30
    if "liver" in detected_types:
        risk_score += 15
    if "cbc" in detected_types:
        risk_score += 10

    if any(term in text for term in ["severe chest pain", "difficulty breathing", "fainting", "stroke", "heart attack"]):
        risk_score += 60

    if risk_score >= 60:
        risk_level = "HIGH"
    elif risk_score >= 30:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    response = {
        "status": "success",
        "uploaded_file": file_path,
        "report_type": detected_types,
        "risk_level": risk_level,
        "summary": build_summary(detected_types, risk_level, [], []),
        "simplified_explanation": build_simple_explanation(detected_types, risk_level, []),
        "findings": [],
        "recommendations": [],
        "precautions": [],
        "emergency_alert": False,
        "disclaimer": "This MedIntel AI summary is for education only and is not a replacement for a qualified doctor.",
        "extracted_text": extracted_text.strip(),
        "extracted_text_preview": extracted_text.strip()[:700],
        "ocr_used": ocr_used,
        "confidence": calculate_confidence(text, detected_types, [], ocr_used),
    }

    return response


if __name__ == '__main__':
    try:
        resp = main()
        json_exit(resp)
    except Exception as e:
        # Print full traceback to stderr so Render / Node logs capture it
        traceback.print_exc(file=sys.stderr)
        try:
            json_exit({
                "status": "error",
                "message": "Unhandled exception in analyzer",
                "error": str(e)
            }, 1)
        except Exception:
            # If json_exit itself fails, ensure we still exit non-zero
            sys.exit(1)
