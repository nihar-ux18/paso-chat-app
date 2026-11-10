import { getModerationAgent, ModerationEnrichmentSchema } from "../mastra/agents/index.js";

/**
 * Enriches a message with Mastra-based moderation intelligence.
 * Returns null if Mastra is disabled, misconfigured, or any error occurs.
 * Never throws — matches the graceful-degradation contract of lib/mlService.js.
 *
 * @param {Object} params
 * @param {string} params.text - The message text
 * @param {Object} params.mlResult - Output from mlService.js: { toxic_score, spam_score, smart_replies }
 * @param {Object} [params.context] - Optional extra context (userId, messageId, isGroup, etc.)
 * @returns {Promise<Object|null>} Validated enrichment object or null
 */
export async function enrichMessage({ text, mlResult, context = {} }) {
  const enabled = process.env.MASTRA_ENABLED === "true";

  if (!enabled) {
    return null;
  }

  try {
    const agent = getModerationAgent();

    const prompt = `
Message: "${text}"

Existing ML Scores:
- toxic_score: ${mlResult?.toxic_score ?? 0}
- spam_score: ${mlResult?.spam_score ?? 0}

Context:
${JSON.stringify(context, null, 2)}

Provide the enrichment as structured JSON.
`.trim();

    // Use Mastra's structured output with zod schema - no manual parsing needed
    const result = await agent.generate(prompt, {
      output: ModerationEnrichmentSchema,
    });

    // result.object is the validated zod object
    return result.object;
  } catch (error) {
    console.error("[Mastra] enrichMessage error:", error.message);
    return null;
  }
}

/**
 * Check if Mastra is enabled and configured.
 * @returns {boolean}
 */
export function isMastraEnabled() {
  return process.env.MASTRA_ENABLED === "true";
}