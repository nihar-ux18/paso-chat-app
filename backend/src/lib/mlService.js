import axios from "axios";

/**
 * Analyzes a message for toxicity and spam, explicitly returning degradation status.
 * Used by Mastra tools to reliably distinguish between benign messages (zeros)
 * and ML service outages/failures.
 *
 * @param {string} text
 * @returns {Promise<{
 *   toxic_score: number,
 *   spam_score: number,
 *   smart_replies: Array<string>,
 *   degraded: boolean,
 *   error: string|null
 * }>}
 */
export const analyzeMessageWithStatus = async (text) => {
  const ML_SERVICE_URL = process.env.ML_SERVICE_URL;

  if (!ML_SERVICE_URL) {
    return {
      toxic_score: 0,
      spam_score: 0,
      smart_replies: [],
      degraded: true,
      error: "ML_SERVICE_URL is not configured",
    };
  }

  try {
    console.log("Calling ML:", ML_SERVICE_URL);

    const response = await axios.post(
      ML_SERVICE_URL,
      { text },
      { timeout: 60000 }
    );

    console.log("ML RESPONSE:", response.data);

    const data = response.data || {};

    if (
      typeof data.toxic_score !== "number" ||
      Number.isNaN(data.toxic_score) ||
      typeof data.spam_score !== "number" ||
      Number.isNaN(data.spam_score)
    ) {
      return {
        toxic_score: 0,
        spam_score: 0,
        smart_replies: [],
        degraded: true,
        error: "ML service returned an invalid response",
      };
    }

    return {
      toxic_score: data.toxic_score,
      spam_score: data.spam_score,
      smart_replies: Array.isArray(data.smart_replies) ? data.smart_replies : [],
      degraded: false,
      error: null,
    };
  } catch (error) {
    console.error("FULL ML ERROR:", error.message || error);
    return {
      toxic_score: 0,
      spam_score: 0,
      smart_replies: [],
      degraded: true,
      error: error.message || "ML service request failed",
    };
  }
};

/**
 * Default export maintaining full backward compatibility.
 * Returns { toxic_score, spam_score, smart_replies } identically to before.
 *
 * @param {string} text
 * @returns {Promise<{ toxic_score: number, spam_score: number, smart_replies: Array<string> }>}
 */
const analyzeMessage = async (text) => {
  const result = await analyzeMessageWithStatus(text);
  return {
    toxic_score: result.toxic_score,
    spam_score: result.spam_score,
    smart_replies: result.smart_replies,
  };
};

export default analyzeMessage;
