import { EmbedBuilder, type Message } from "discord.js";
import { Embeds, brandFooter } from "../embed";
import { config } from "../../config";
import { getMapping } from "../../db/queries";
import { getConversation } from "../../chatwoot/client";
import { isChatwootHealthy } from "../../chatwoot/health";

const STATUS_DISPLAY: Record<string, string> = {
  open:     "🟢  Open",
  pending:  "🟡  Pending",
  resolved: "🔴  Resolved",
  snoozed:  "😴  Snoozed",
};

export async function execute(message: Message): Promise<void> {
  if (!isChatwootHealthy()) {
    await message.reply({
      embeds: [Embeds.warning("Support service is currently unreachable. Please try again in a few minutes.")],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const mapping = getMapping(message.author.id);
  if (!mapping) {
    await message.reply({
      embeds: [
        Embeds.warning(
          "You don't have a support ticket yet. Send a message to open one."
        ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  let conv;
  try {
    conv = await getConversation(mapping.chatwoot_conv_id);
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) {
      await message.reply({
        embeds: [Embeds.warning("Your ticket could not be found. It may have been deleted. Send a new message to open a fresh ticket.")],
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    throw err;
  }

  const statusLabel = STATUS_DISPLAY[conv.status] ?? conv.status;

  const lastActivity = conv.last_activity_at
    ? `<t:${conv.last_activity_at}:R>`
    : "Unknown";

  const color =
    conv.status === "open"
      ? config.colors.success
      : conv.status === "resolved"
      ? config.colors.danger
      : config.colors.warning;

  const footer = brandFooter();
  const embed = new EmbedBuilder()
    .setTitle("🎫  Support Ticket")
    .setColor(color)
    .addFields(
      { name: "Status",        value: statusLabel,                      inline: true },
      { name: "Ticket ID",     value: `#${mapping.chatwoot_conv_id}`,   inline: true },
      { name: "Last Activity", value: lastActivity,                     inline: true }
    )
    .setFooter({ text: `${footer.text} · !close  !reopen  !help`, ...(footer.iconURL ? { iconURL: footer.iconURL } : {}) })
    .setTimestamp();

  await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}
