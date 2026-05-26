const labRanges = {

    hemoglobin: {
        min: 13,
        max: 17,
        unit: "g/dL",
        category: "CBC",
        low: "Low hemoglobin may indicate anemia.",
        high: "High hemoglobin may indicate dehydration."
    },

    wbc: {
        min: 4000,
        max: 11000,
        unit: "/mcL",
        category: "CBC",
        low: "Low WBC may indicate immune suppression.",
        high: "High WBC may indicate infection."
    },

    platelets: {
        min: 150000,
        max: 450000,
        unit: "/mcL",
        category: "CBC",
        low: "Low platelet count may increase bleeding risk.",
        high: "High platelet count may indicate inflammation."
    },

    glucose: {
        min: 70,
        max: 140,
        unit: "mg/dL",
        category: "Diabetes / Metabolic",
        low: "Low glucose may indicate hypoglycemia.",
        high: "High glucose may indicate diabetes risk."
    },

    cholesterol: {
        min: 120,
        max: 200,
        unit: "mg/dL",
        category: "Heart / Lipid",
        low: "Low cholesterol usually is not dangerous.",
        high: "High cholesterol may increase heart disease risk."
    },

    creatinine: {
        min: 0.7,
        max: 1.3,
        unit: "mg/dL",
        category: "Kidney",
        low: "Low creatinine usually is not dangerous.",
        high: "High creatinine may indicate kidney dysfunction."
    },

    hba1c: {
        min: 4,
        max: 5.6,
        unit: "%",
        category: "Diabetes / Metabolic",
        low: "Low HbA1c can occur with low average blood sugar or certain blood conditions.",
        high: "High HbA1c suggests elevated average blood sugar and possible diabetes risk."
    },

    triglycerides: {
        min: 40,
        max: 150,
        unit: "mg/dL",
        category: "Heart / Lipid",
        low: "Low triglycerides are often not dangerous by themselves.",
        high: "High triglycerides may increase cardiovascular and metabolic risk."
    },

    alt: {
        min: 7,
        max: 56,
        unit: "U/L",
        category: "Liver",
        low: "Low ALT is usually not clinically concerning by itself.",
        high: "High ALT can indicate liver irritation or injury."
    },

    ast: {
        min: 10,
        max: 40,
        unit: "U/L",
        category: "Liver",
        low: "Low AST is usually not clinically concerning by itself.",
        high: "High AST can indicate liver, muscle, or cardiac stress."
    },

    bilirubin: {
        min: 0.1,
        max: 1.2,
        unit: "mg/dL",
        category: "Liver",
        low: "Low bilirubin is usually not clinically concerning.",
        high: "High bilirubin may indicate liver or bile flow problems."
    },

    urea: {
        min: 7,
        max: 20,
        unit: "mg/dL",
        category: "Kidney",
        low: "Low urea can occur with low protein intake or liver-related issues.",
        high: "High urea may suggest dehydration or reduced kidney clearance."
    }
};

module.exports = labRanges;
