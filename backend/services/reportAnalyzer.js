const labRanges =
    require("../data/labRanges");

function analyzeLabValue(
    name,
    value
) {

    const test =
        labRanges[name.toLowerCase()];

    if (!test) {

        return null;
    }

    if (!Number.isFinite(value)) {
        return null;
    }

    let status = "Normal";
    let severity = "normal";

    let explanation =
        "Within normal range.";

    if (value < test.min) {

        status = "Low";
        severity = value < test.min * 0.8 ? "critical" : "attention";

        explanation =
            test.low;
    }

    if (value > test.max) {

        status = "High";
        severity = value > test.max * 1.2 ? "critical" : "attention";

        explanation =
            test.high;
    }

    return {

        test: name,

        value,

        unit: test.unit,

        status,

        severity,

        normalRange: `${test.min}-${test.max} ${test.unit}`,

        category: test.category || "General",

        explanation
    };
}

function analyzeReport(
    extractedData
) {

    const results = [];

    for (const key in extractedData) {

        const analysis =
            analyzeLabValue(
                key,
                Number(
                    extractedData[key]
                )
            );

        if (analysis) {

            results.push(
                analysis
            );
        }
    }

    return results;
}

module.exports = {
    analyzeReport
};
