import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { analyzeMessageWithStatus } from "../../lib/mlService.js";

/**
 * Tool for evaluating message toxicity and spam levels via mlService.
 * Returns typed results and reliably detects service outages (degraded: true).
 */
export const toxicitySpamTool = createTool({
  id: "toxicity-spam-tool",
  description: "Analyzes a message text for toxicity and spam scores using the ML classification service.",
  inputSchema: z.object({
    text: z.string().describe("The message text to analyze"),
  }),
  outputSchema: z.object({
    toxic_score: z.number().min(0).max(1),
    spam_score: z.number().min(0).max(1),
    isToxic: z.boolean(),
    isSpam: z.boolean(),
    degraded: z.boolean(),
    error: z.string().nullable(),
  }),
  execute: async ({ context }) => {
    try {
      const text = typeof context?.text === "string" ? context.text : "";
      const result = await analyzeMessageWithStatus(text);

      const toxicScore = Number((result.toxic_score ?? 0).toFixed(4));
      const spamScore = Number((result.spam_score ?? 0).toFixed(4));

      return {
        toxic_score: toxicScore,
        spam_score: spamScore,
        // Existing thresholds: toxic > 0.8, spam > 0.5
        isToxic: toxicScore > 0.8,
        isSpam: spamScore > 0.5,
        degraded: Boolean(result.degraded),
        error: result.error ?? null,
      };
    } catch (err) {
      return {
        toxic_score: 0,
        spam_score: 0,
        isToxic: false,
        isSpam: false,
        degraded: true,
        error: err.message || "Failed to execute toxicity-spam tool",
      };
    }
  },
});

