/**
 * Simple Express server:
 * - Serves static HTML/CSS/JS files
 * - Handles POST /api/analyze (DeepSeek integration, key stays server-side)
 */

require("dotenv").config({ path: ".env.local" });

const express = require("express");
const path = require("path");
const { analyzeAssessment } = require("./lib/deepseek");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

/** Server-side form validation */
function validateFormData(data) {
  const rules = {
    gradeLevel: { required: true, message: "Please select your grade level." },
    currentSubjects: { min: 3, message: "Please describe the subjects you are currently studying." },
    strongestSubjects: { min: 3, message: "Please describe your strongest academic subjects." },
    academicChallenges: { min: 3, message: "Please describe your current academic challenges." },
    extracurriculars: { min: 3, message: "Please describe your extracurricular activities." },
    proudestAchievement: { min: 3, message: "Please share an achievement you are proud of." },
    extracurricularHours: { required: true, message: "Please indicate your weekly extracurricular hours." },
    assessmentFocus: { min: 10, message: "Please describe what you would like to assess (at least 10 characters)." },
  };

  for (const [field, rule] of Object.entries(rules)) {
    const value = (data[field] || "").trim();
    if (rule.required && !value) return rule.message;
    if (rule.min && value.length < rule.min) return rule.message;
  }

  return null;
}

/**
 * POST /api/analyze
 * Receives form data, validates, calls DeepSeek, returns structured JSON.
 */
app.post("/api/analyze", async (req, res) => {
  try {
    const validationError = validateFormData(req.body);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const result = await analyzeAssessment(req.body);
    return res.json({ result });
  } catch (error) {
    console.error("[/api/analyze]", error.message);
    return res.status(500).json({
      error: error.message || "An unexpected error occurred while analyzing your assessment.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Student Self-Assessment Tool running at http://localhost:${PORT}`);
});
