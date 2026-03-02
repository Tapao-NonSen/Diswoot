import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { Embeds } from "../embed";
import { config } from "../../config";
import { getMapping } from "../../db/queries";
import { getConversation } from "../../chatwoot/client";

const STATUS_DISPLAY: Record<string, string> = {
  open: "🟢 Open",
  pending: "🟡 Pending (waiting for agent)",
  resolved: "🔴 Resolved",
  snoozed: "😴 Snoozed",
};

export const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Check the status of your support ticket");

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const mapping = getMapping(interaction.user.id);
  if (!mapping) {
    await interaction.editReply({
      embeds: [
        Embeds.warning(
          "You don't have a support ticket yet. Send a message to open one."
        ),
      ],
    });
    return;
  }

  const conv = await getConversation(mapping.chatwoot_conv_id);
  const statusLabel = STATUS_DISPLAY[conv.status] ?? conv.status;

  // last_activity_at is a unix timestamp (seconds)
  const lastActivity = conv.last_activity_at
    ? `<t:${conv.last_activity_at}:R>`
    : "Unknown";

  const color =
    conv.status === "open"
      ? config.colors.success
      : conv.status === "resolved"
      ? config.colors.danger
      : config.colors.warning;

  const embed = new EmbedBuilder()
    .setTitle("Your Support Ticket")
    .setColor(color)
    .addFields(
      { name: "Status", value: statusLabel, inline: true },
      { name: "Last Activity", value: lastActivity, inline: true },
      { name: "Ticket ID", value: `#${mapping.chatwoot_conv_id}`, inline: true }
    )
    .setFooter({
      text: "Use /close to close · /reopen to reopen · /status to check",
    });

  await interaction.editReply({ embeds: [embed] });
}
