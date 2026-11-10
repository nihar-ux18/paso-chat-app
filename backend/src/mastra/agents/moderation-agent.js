import { z } from "zod";
import { Agent } from "@mastra/core/agent";

/**
 * Output schema for the moderation enrichment agent.
 * Uses zod for structured output validation.
 */
const ModerationEnrichmentSchema = z.object({
  severity: z.enum(["low", "medium", "high", "critical"]),
  categories: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  recommendedAction: z.enum(["none", "review", "warn", "delete", "ban"]),
  flags: z.array(z.string()).default([]),
  reasoning: z.string().default(""),
});

/**
 * Creates the moderation enrichment agent.
 * Uses Mastra's model router string format - no provider package needed.
 * Reads GROQ_API_KEY from environment automatically.
 */
function createModerationAgent() {
  const modelName = process.env.MASTRA_MODEL || "groq/llama-3.3-70b-versatile";

  return new Agent({
    id: "moderation-enrichment",
    name: "Moderation Enrichment Agent",
    instructions: `
You are a message moderation intelligence agent. Given a message and its existing ML scores (toxic, spam), provide a structured enrichment that helps admins triage.

Output MUST conform to the provided JSON schema exactly.

Guidelines:
- severity: "low" = benign; "medium" = concerning but not actionable; "high" = likely violation; "critical" = severe harm
- categories: e.g., ["hate_speech", "harassment", "spam", "sexual_content", "violence", "self_harm", "pii", "scam"]
- confidence: 0.0-1.0, your confidence in the assessment
- recommendedAction: what an admin should do ("none", "review", "warn", "delete", "ban")
- flags: specific signals that triggered this (e.g., "toxic_score_above_threshold", "spam_pattern", "repeated_offender")
- reasoning: 1-2 sentence explanation

Use the provided toxic/spam scores as context. Do NOT override them; augment with your LLM-based analysis.
`.trim(),
    model: modelName,
  });
}

let moderationAgent = null;

export function getModerationAgent() {
  if (!moderationAgent) {
    moderationAgent = createModerationAgent();
  }
  return moderationAgent;
}

export { ModerationEnrichmentSchema };