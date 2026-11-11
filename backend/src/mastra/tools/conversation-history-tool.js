import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import Message from "../../models/message.model.js";

/**
 * Tool for retrieving recent conversation history.
 * Hard-caps results at 20 messages, truncates each text to ~300 chars,
 * and wraps text in <untrusted_message> tags to prevent injection from chat history.
 */
export const conversationHistoryTool = createTool({
  id: "conversation-history-tool",
  description: "Fetches recent conversation messages for a direct or group chat, sanitizing and wrapping untrusted text.",
  inputSchema: z.object({
    senderId: z.string().describe("User ID of the message sender or requester"),
    receiverId: z.string().optional().describe("User ID of the chat recipient (for direct chats)"),
    groupId: z.string().optional().describe("Group ID (for group chats)"),
    limit: z.number().int().min(1).default(10).describe("Number of messages to retrieve (hard cap 20)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messages: z.array(
      z.object({
        messageId: z.string(),
        senderId: z.string(),
        text: z.string(),
        timestamp: z.string().nullable(),
        isToxic: z.boolean(),
        isSpam: z.boolean(),
      })
    ),
    count: z.number(),
    error: z.string().nullable(),
  }),
  execute: async ({ context }) => {
    try {
      const { senderId, receiverId, groupId } = context || {};

      if (!senderId) {
        return {
          success: false,
          messages: [],
          count: 0,
          error: "senderId is required",
        };
      }

      if (!receiverId && !groupId) {
        return {
          success: false,
          messages: [],
          count: 0,
          error: "Either receiverId or groupId must be provided",
        };
      }

      // Hard cap at 20 messages
      const effectiveLimit = Math.min(Math.max(1, context.limit ?? 10), 20);

      const filter = {
        deletedForEveryone: { $ne: true },
      };

      if (groupId) {
        filter.groupId = groupId;
      } else {
        filter.$or = [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ];
      }

      const rawMessages = await Message.find(filter)
        .sort({ createdAt: -1 })
        .limit(effectiveLimit)
        .select("_id senderId text createdAt toxic spam")
        .lean();

      // Reverse so messages are chronological (oldest to newest within the window)
      const formatted = rawMessages.reverse().map((msg) => {
        const rawText = typeof msg.text === "string" ? msg.text.slice(0, 300) : "";
        const sanitized = rawText.replace(/<\/?untrusted_message>/gi, "");
        const wrappedText = `<untrusted_message>\n${sanitized}\n</untrusted_message>`;

        return {
          messageId: msg._id?.toString() ?? "",
          senderId: msg.senderId?.toString() ?? "",
          text: wrappedText,
          timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : null,
          isToxic: Boolean(msg.toxic),
          isSpam: Boolean(msg.spam),
        };
      });

      return {
        success: true,
        messages: formatted,
        count: formatted.length,
        error: null,
      };
    } catch (err) {
      return {
        success: false,
        messages: [],
        count: 0,
        error: err.message || "Failed to retrieve conversation history",
      };
    }
  },
});
