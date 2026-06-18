/**
 * DeepSeek API client — server-side only.
 * Reads DEEPSEEK_API_KEY from environment variables.
 */

const { SYSTEM_PROMPT, buildUserPrompt } = require("./prompts");

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

/**
 * Calls DeepSeek and returns parsed, validated assessment feedback.
 */
async function analyzeAssessment(formData) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("DeepSeek API key is not configured. Set DEEPSEEK_API_KEY in .env.local");
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(formData) },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`DeepSeek API error (${response.status}): ${errorBody || response.statusText}`);
  }

  const data = await response.json();

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const rawContent = data.choices?.[0]?.message?.content;

  if (!rawContent) {
    throw new Error("DeepSeek returned an empty response.");
  }

  // Strip markdown fences if the model wraps JSON despite instructions
  const cleaned = rawContent.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Failed to parse DeepSeek response as JSON.");
  }

  // Basic structure validation
  if (
    !Array.isArray(parsed.strengths) ||
    !parsed.biggestGap ||
    !parsed.nextStep ||
    !parsed.summary
  ) {
    throw new Error("DeepSeek response did not match the expected format.");
  }

  return parsed;
}

module.exports = { analyzeAssessment };
