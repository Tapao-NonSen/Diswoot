import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { config } from "../../config";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show available commands and how to contact support");

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("Support Bot — Help")
    .setColor(config.colors.primary)
    .setDescription(
      "Send a **direct message** to this bot to contact support. An agent will reply here in the DM."
    )
    .addFields(
      {
        name: "Commands",
        value: [
          "`/status` — Check your current ticket status",
          "`/close [reason]` — Close your ticket",
          "`/reopen` — Reopen a resolved ticket",
          "`/help` — Show this message",
        ].join("\n"),
      },
      {
        name: "How it works",
        value:
          "Every message you DM to this bot is forwarded to our support team. Replies will appear here in your DMs.",
      }
    )
    .setFooter({ text: "We typically respond within a few hours." });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
