import { ChannelType, EmbedBuilder, type Message } from "discord.js";
import { config } from "../../config";
import { getMapping, saveMapping } from "../../db/queries";
import {
  createContact,
  createConversation,
  sendMessage,
  getConversation,
  toggleStatus,
} from "../../chatwoot/client";
import { getCachedInbox } from "../../chatwoot/inboxCache";
import { isWithinWorkingHours, nextOpeningTime } from "../../chatwoot/workingHours";

export async function handleDM(message: Message): Promise<void> {
  // Only process DMs, ignore bots, ignore slash command invocations
  if (message.channel.type !== ChannelType.DM) return;
  if (message.author.bot) return;
  if (message.content.startsWith("/")) return;

  const user = message.author;
  const userId = user.id;

  try {
    // ── Working hours check (single pass) ───────────────────────────────────
    const inbox = await getCachedInbox();
    let isOpen = true;
    let returnsText = "";
    // Use inbox's out_of_office_message; fall back to env if blank
    const offlineMsg =
      inbox?.out_of_office_message?.trim() ||
      config.outsideHours.fallbackMessage;

    if (inbox) {
      isOpen = isWithinWorkingHours(
        inbox.working_hours,
        inbox.timezone,
        inbox.working_hours_enabled
      );
      if (!isOpen) {
        returnsText = nextOpeningTime(inbox.working_hours, inbox.timezone);

        if (config.outsideHours.behavior === "deny") {
          const embed = new EmbedBuilder()
            .setColor(config.colors.warning)
            .setDescription(`⏰  ${offlineMsg}`)
            .setFooter({ text: `Support returns ${returnsText}` });
          await message.reply({ embeds: [embed] }).catch(() => {});
          return; // ← do NOT create or touch the ticket
        }
      }
    }

    // ── Find or create Chatwoot mapping ─────────────────────────────────────
    let mapping = getMapping(userId);

    if (!mapping) {
      const { contactId, sourceId } = await createContact({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarURL: user.displayAvatarURL({ size: 256 }),
      });
      const convId = await createConversation(sourceId, contactId);
      saveMapping(userId, contactId, sourceId, convId);
      mapping = getMapping(userId)!;
    } else {
      // Reopen resolved / snoozed conversations automatically
      const conv = await getConversation(mapping.chatwoot_conv_id);
      if (conv.status === "resolved" || conv.status === "snoozed") {
        await toggleStatus(mapping.chatwoot_conv_id, "open");
      }
    }

    // ── Forward message to Chatwoot ──────────────────────────────────────────
    const parts: string[] = [];
    if (message.content.trim()) parts.push(message.content.trim());
    for (const att of message.attachments.values()) {
      parts.push(`[Attachment: ${att.name}](${att.url})`);
    }
    const content = parts.join("\n") || "(empty message)";

    await sendMessage(mapping.chatwoot_conv_id, content, "incoming");

    // React to confirm receipt
    await message.react(config.ux.confirmEmoji).catch(() => {});

    // ── Outside-hours notice (allow mode) ────────────────────────────────────
    if (!isOpen) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setDescription(`🕐  ${offlineMsg}`)
        .setFooter({ text: `Support returns ${returnsText}` });
      await message.reply({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error(`[dmHandler] Error for user ${userId}:`, err);
    const embed = new EmbedBuilder()
      .setColor(config.colors.danger)
      .setDescription("❌  Something went wrong. Please try again in a moment.");
    await message.reply({ embeds: [embed] }).catch(() => {});
  }
}
