import { ChannelType, EmbedBuilder, type Message } from "discord.js";
import { brandFooter } from "../embed";
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
import { execute as closeCommand } from "../commands/close";
import { execute as reopenCommand } from "../commands/reopen";
import { execute as statusCommand } from "../commands/status";
import { execute as helpCommand } from "../commands/help";

const PREFIX = "!";

export async function handleDM(message: Message): Promise<void> {
  // Only process DMs, ignore bots
  if (message.channel.type !== ChannelType.DM) return;
  if (message.author.bot) return;

  // ── Message commands (NOT forwarded to Chatwoot) ─────────────────────────
  if (message.content.startsWith(PREFIX)) {
    const parts = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    if (!cmd) return;
    try {
      switch (cmd.toLowerCase()) {
        case "close":  await closeCommand(message, args); break;
        case "reopen": await reopenCommand(message); break;
        case "status": await statusCommand(message); break;
        case "help":   await helpCommand(message); break;
        // Unknown commands are silently ignored
      }
    } catch (err) {
      console.error(`[dmHandler] Command !${cmd} error:`, err);
      const embed = new EmbedBuilder()
        .setColor(config.colors.danger)
        .setDescription("❌  Something went wrong. Please try again in a moment.")
        .setFooter(brandFooter());
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => {});
    }
    return; // Do NOT forward command messages to Chatwoot
  }

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

        if (!config.outsideHours.behavior) {
          const embed = new EmbedBuilder()
            .setColor(config.colors.warning)
            .setTitle("🕐  Outside Support Hours")
            .setDescription(offlineMsg)
            .addFields({ name: "Next availability", value: returnsText, inline: true })
            .setFooter(brandFooter());
          await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => {});
          return; // ← do NOT create or touch the ticket
        }
      }
    }

    // ── Find or create Chatwoot mapping ─────────────────────────────────────
    let mapping = getMapping(userId);

    // Outside-hours allow mode: keep tickets as "pending" so agents aren't
    // interrupted; during business hours, open them normally.
    const reopenStatus = isOpen ? "open" : "pending";

    const isNewContact = !mapping;

    if (!mapping) {
      const { contactId, sourceId } = await createContact({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarURL: user.displayAvatarURL({ size: 256 }),
      });
      const convId = await createConversation(sourceId, contactId, reopenStatus);
      saveMapping(userId, contactId, sourceId, convId);
      mapping = getMapping(userId)!;
    } else {
      // Fetch existing conversation — may be 404 if deleted from Chatwoot
      let conv: Awaited<ReturnType<typeof getConversation>> | null = null;
      try {
        conv = await getConversation(mapping.chatwoot_conv_id);
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) {
          console.warn(
            `[dmHandler] Conversation ${mapping.chatwoot_conv_id} not found in Chatwoot — creating a new one`
          );
        } else {
          throw err;
        }
      }

      if (conv === null) {
        // Stale mapping: conversation was deleted from Chatwoot. Create a new
        // conversation reusing the existing contact + source inbox.
        const newConvId = await createConversation(
          mapping.chatwoot_source_id,
          mapping.chatwoot_contact_id,
          reopenStatus
        );
        saveMapping(userId, mapping.chatwoot_contact_id, mapping.chatwoot_source_id, newConvId);
        mapping = getMapping(userId)!;
      } else if (conv.status === "resolved" || conv.status === "snoozed") {
        // Reopen resolved / snoozed conversations automatically
        await toggleStatus(mapping.chatwoot_conv_id, reopenStatus);
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

    // ── Greeting (first contact only) ────────────────────────────────────────
    const chatwootGreetingEnabled = inbox?.greeting_enabled ?? false;
    const chatwootGreetingMsg = inbox?.greeting_message?.trim() ?? "";
    const greetingMsg = chatwootGreetingMsg || config.ux.greetingMessage;
    const greetingEnabled = chatwootGreetingEnabled || config.ux.greetingEnabled;

    if (isNewContact && greetingEnabled) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle("👋  Welcome!")
        .setDescription(greetingMsg)
        .setFooter(brandFooter());
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => {});
    }

    // ── Outside-hours notice (allow mode) ────────────────────────────────────
    if (!isOpen) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setTitle("🕐  Outside Support Hours")
        .setDescription(offlineMsg)
        .addFields({ name: "Next availability", value: returnsText, inline: true })
        .setFooter(brandFooter());
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => {});
    }
  } catch (err) {
    console.error(`[dmHandler] Error for user ${userId}:`, err);
    const embed = new EmbedBuilder()
      .setColor(config.colors.danger)
      .setDescription("❌  Something went wrong. Please try again in a moment.");
    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => {});
  }
}
