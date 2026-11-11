import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import User from "../../models/user.model.js";
import Message from "../../models/message.model.js";
import Report from "../../models/report.model.js";

/**
 * Tool for evaluating user behavioral patterns.
 * Aggregates account age, message volume in recent window, prior reports,
 * ban status, and historical toxic/spam counts.
 * Explicitly guards against returning any PII, emails, passwords, OTPs, or tokens.
 */
export const userBehaviorTool = createTool({
  id: "user-behavior-tool",
  description: "Aggregates behavioral metrics for a user: recent message velocity, prior reports, ban status, account age, and past violations.",
  inputSchema: z.object({
    userId: z.string().describe("User ID to fetch behavioral signals for"),
    windowMinutes: z.number().int().min(1).max(10080).default(60).describe("Recent time window in minutes (default 60 mins)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    userId: z.string(),
    isBanned: z.boolean(),
    banReason: z.string().nullable(),
    accountAgeDays: z.number(),
    recentMessageCount: z.number(),
    priorReportsCount: z.number(),
    pastToxicCount: z.number(),
    pastSpamCount: z.number(),
    pastFlaggedCount: z.number(),
    error: z.string().nullable(),
  }),
  execute: async ({ context }) => {
    try {
      const { userId, windowMinutes = 60 } = context || {};

      if (!userId) {
        return {
          success: false,
          userId: "",
          isBanned: false,
          banReason: null,
          accountAgeDays: 0,
          recentMessageCount: 0,
          priorReportsCount: 0,
          pastToxicCount: 0,
          pastSpamCount: 0,
          pastFlaggedCount: 0,
          error: "userId is required",
        };
      }

      // Explicitly select only non-sensitive fields
      const user = await User.findById(userId)
        .select("isBanned banReason createdAt role")
        .lean();

      if (!user) {
        return {
          success: false,
          userId,
          isBanned: false,
          banReason: null,
          accountAgeDays: 0,
          recentMessageCount: 0,
          priorReportsCount: 0,
          pastToxicCount: 0,
          pastSpamCount: 0,
          pastFlaggedCount: 0,
          error: "User not found",
        };
      }

      const accountAgeDays = user.createdAt
        ? Math.max(0, Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

      const windowMins = Math.min(Math.max(1, windowMinutes), 10080);
      const sinceDate = new Date(Date.now() - windowMins * 60 * 1000);

      const [recentMessageCount, priorReportsCount, pastToxicCount, pastSpamCount, pastFlaggedCount] =
        await Promise.all([
          Message.countDocuments({ senderId: userId, createdAt: { $gte: sinceDate } }),
          Report.countDocuments({ reportedUser: userId }),
          Message.countDocuments({ senderId: userId, toxic: true }),
          Message.countDocuments({ senderId: userId, spam: true }),
          Message.countDocuments({ senderId: userId, $or: [{ toxic: true }, { spam: true }] }),
        ]);

      return {
        success: true,
        userId: user._id.toString(),
        isBanned: Boolean(user.isBanned),
        banReason: user.banReason || null,
        accountAgeDays,
        recentMessageCount,
        priorReportsCount,
        pastToxicCount,
        pastSpamCount,
        pastFlaggedCount,
        error: null,
      };
    } catch (err) {
      return {
        success: false,
        userId: context?.userId || "",
        isBanned: false,
        banReason: null,
        accountAgeDays: 0,
        recentMessageCount: 0,
        priorReportsCount: 0,
        pastToxicCount: 0,
        pastSpamCount: 0,
        pastFlaggedCount: 0,
        error: err.message || "Failed to retrieve user behavior",
      };
    }
  },
});

