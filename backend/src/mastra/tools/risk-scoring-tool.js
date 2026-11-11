import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Deterministic risk scoring tool (no LLM).
 * Combines ML toxicity/spam scores, user history, and message velocity
 * into a transparent 0-100 score and breakdown.
 *
 * When ML is degraded, prevents dropping to a "safe" / allow status,
 * adds the "mlUnavailable" flag, and returns an "uncertain" risk level.
 */
export const riskScoringTool = createTool({
  id: "risk-scoring-tool",
  description: "Computes a deterministic 0-100 moderation risk score with a detailed breakdown. Never treats degraded ML as safe.",
  inputSchema: z.object({
    toxicScore: z.number().min(0).max(1).default(0),
    spamScore: z.number().min(0).max(1).default(0),
    degraded: z.boolean().default(false).describe("Whether the ML service was degraded/offline"),
    userMetrics: z
      .object({
        recentMessageCount: z.number().default(0),
        priorReportsCount: z.number().default(0),
        isBanned: z.boolean().default(false),
        accountAgeDays: z.number().default(30),
        pastFlaggedCount: z.number().default(0),
      })
      .optional(),
  }),
  outputSchema: z.object({
    riskScore: z.number().min(0).max(100),
    riskLevel: z.enum(["low", "medium", "high", "critical", "uncertain"]),
    degraded: z.boolean(),
    flags: z.array(z.string()),
    breakdown: z.object({
      toxicityPoints: z.number(),
      spamPoints: z.number(),
      userHistoryPoints: z.number(),
      velocityPoints: z.number(),
    }),
    actionRecommendation: z.enum(["allow", "flag", "warn", "escalate"]),
  }),
  execute: async ({ context }) => {
    try {
      const toxicScore = context?.toxicScore ?? 0;
      const spamScore = context?.spamScore ?? 0;
      const degraded = Boolean(context?.degraded);
      const user = context?.userMetrics || {};

      const flags = [];

      // 1. Toxicity Component (max 50 points)
      // Existing threshold: toxic > 0.8
      let toxicityPoints = 0;
      if (toxicScore > 0.8) {
        toxicityPoints = Math.round(40 + ((toxicScore - 0.8) / 0.2) * 10);
        flags.push("toxic_threshold_exceeded");
      } else if (toxicScore > 0.5) {
        toxicityPoints = Math.round(toxicScore * 30);
        flags.push("moderate_toxicity");
      } else {
        toxicityPoints = Math.round(toxicScore * 20);
      }

      // 2. Spam Component (max 30 points)
      // Existing threshold: spam > 0.5
      let spamPoints = 0;
      if (spamScore > 0.5) {
        spamPoints = Math.round(20 + ((spamScore - 0.5) / 0.5) * 10);
        flags.push("spam_threshold_exceeded");
      } else {
        spamPoints = Math.round(spamScore * 20);
      }

      // 3. User History Component (max 30 points)
      let userHistoryPoints = 0;
      if (user.isBanned) {
        userHistoryPoints += 25;
        flags.push("user_is_banned");
      }
      if (user.priorReportsCount > 0) {
        const reportPoints = Math.min(15, user.priorReportsCount * 5);
        userHistoryPoints += reportPoints;
        flags.push("prior_reports_present");
      }
      if (user.pastFlaggedCount > 0) {
        const pastViolationPoints = Math.min(15, user.pastFlaggedCount * 3);
        userHistoryPoints += pastViolationPoints;
        flags.push("past_violations_found");
      }
      userHistoryPoints = Math.min(30, userHistoryPoints);

      // 4. Velocity and Account Age Component (max 15 points)
      let velocityPoints = 0;
      if (user.recentMessageCount > 30) {
        velocityPoints += 10;
        flags.push("high_message_velocity");
      }
      if (user.accountAgeDays < 1) {
        velocityPoints += 5;
        flags.push("new_account");
      }
      velocityPoints = Math.min(15, velocityPoints);

      // Sum and clamp to 0-100
      const rawScore = toxicityPoints + spamPoints + userHistoryPoints + velocityPoints;
      const riskScore = Math.min(100, Math.max(0, rawScore));

      // 5. Handling Degraded ML
      if (degraded) {
        flags.push("mlUnavailable");
      }

      let riskLevel;
      let actionRecommendation;

      if (degraded && riskScore < 25) {
        // Crucial requirement: When degraded is true, score must NOT drop to "safe"
        riskLevel = "uncertain";
        actionRecommendation = "flag";
      } else if (riskScore >= 75) {
        riskLevel = "critical";
        actionRecommendation = "escalate";
      } else if (riskScore >= 50) {
        riskLevel = "high";
        actionRecommendation = "warn";
      } else if (riskScore >= 25) {
        riskLevel = "medium";
        actionRecommendation = "flag";
      } else {
        riskLevel = "low";
        actionRecommendation = "allow";
      }

      return {
        riskScore,
        riskLevel,
        degraded,
        flags,
        breakdown: {
          toxicityPoints,
          spamPoints,
          userHistoryPoints,
          velocityPoints,
        },
        actionRecommendation,
      };
    } catch (err) {
      return {
        riskScore: 50,
        riskLevel: "uncertain",
        degraded: true,
        flags: ["mlUnavailable", "scoring_error"],
        breakdown: {
          toxicityPoints: 0,
          spamPoints: 0,
          userHistoryPoints: 0,
          velocityPoints: 0,
        },
        actionRecommendation: "flag",
      };
    }
  },
});

