const { Buffer } = require("buffer");

function escapePdfText(text) {
    return String(text ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
        .replace(/\r?\n/g, " ");
}

function wrapText(text, maxLength = 90) {
    const words = String(text ?? "").split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;

        if (candidate.length > maxLength) {
            if (current) {
                lines.push(current);
            }
            current = word;
        } else {
            current = candidate;
        }
    }

    if (current) {
        lines.push(current);
    }

    return lines.length ? lines : [""];
}

function buildContentLines(summary) {
    const lines = [
        "AI HEALTHCARE REPORT SUMMARY",
        "",
        `Report Type: ${summary.reportType || "-"}`,
        `Risk Level: ${summary.riskLevel || "-"}`,
        `Uploaded File: ${summary.fileName || "-"}`,
        `Date/Time: ${summary.uploadedAt || new Date().toISOString()}`,
        "",
        "Summary:",
        ...(wrapText(summary.summary || "-", 92)),
        "",
        "Findings:",
        ...(Array.isArray(summary.findings) && summary.findings.length
            ? summary.findings.flatMap((item) => wrapText(`- ${item}`, 92))
            : ["-"]),
        "",
        "Recommendations:",
        ...(Array.isArray(summary.recommendations) && summary.recommendations.length
            ? summary.recommendations.flatMap((item) => wrapText(`- ${item}`, 92))
            : ["-"]),
        "",
        "Disclaimer:",
        ...(wrapText(summary.disclaimer || "This MedIntel AI summary is for education only and is not a replacement for a qualified doctor.", 92))
    ];

    return lines;
}

function buildPdfBuffer(summary) {
    const contentLines = buildContentLines(summary);
    const contentStream = [
        "BT",
        "/F1 12 Tf",
        "14 TL",
        "1 0 0 1 50 760 Tm"
    ];

    contentLines.forEach((line, index) => {
        if (index === 0) {
            contentStream.push(`(${escapePdfText(line)}) Tj`);
        } else {
            contentStream.push("T*");
            contentStream.push(`(${escapePdfText(line)}) Tj`);
        }
    });

    contentStream.push("ET");

    const contentBody = contentStream.join("\n");
    const contentLength = Buffer.byteLength(contentBody, "utf8");

    const objects = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        `5 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentBody}\nendstream\nendobj\n`
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];

    for (const object of objects) {
        offsets.push(Buffer.byteLength(pdf, "utf8"));
        pdf += object;
    }

    const xrefStart = Buffer.byteLength(pdf, "utf8");
    let xref = "xref\n0 6\n";
    xref += "0000000000 65535 f \n";

    for (let i = 1; i <= 5; i += 1) {
        xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }

    const trailer = [
        "trailer",
        "<< /Size 6 /Root 1 0 R >>",
        "startxref",
        String(xrefStart),
        "%%EOF"
    ].join("\n");

    pdf += xref + trailer;

    return Buffer.from(pdf, "utf8");
}

function generateSummaryPdf(summary) {
    const normalized = {
        reportType: summary.reportType || summary.report_type || "-",
        riskLevel: summary.riskLevel || summary.risk_level || "-",
        uploadedAt: summary.uploadedAt || summary.uploaded_at || new Date().toISOString(),
        fileName: summary.fileName || summary.uploaded_file || "-",
        findings: Array.isArray(summary.findings) ? summary.findings : [],
        recommendations: Array.isArray(summary.recommendations) ? summary.recommendations : [],
        summary: summary.summary || "-",
        disclaimer: summary.disclaimer || "This MedIntel AI summary is for education only and is not a replacement for a qualified doctor."
    };

    return buildPdfBuffer(normalized);
}

module.exports = { generateSummaryPdf };
