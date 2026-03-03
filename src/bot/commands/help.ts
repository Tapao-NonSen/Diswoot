import { EmbedBuilder, type Message } from "discord.js";
import { brandFooter } from "../embed";
import { config } from "../../config";

export async function execute(message: Message): Promise<void> {
  const footer = brandFooter();
  const embed = new EmbedBuilder()
    .setTitle("📋  Support Help")
    .setColor(config.colors.primary)
    .setDescription(
      "Send a direct message to contact our support team. An agent will reply here in your DMs."
    )
    .addFields(
      {
        name: "⌨️  Commands",
        value: [
          "`!status` — View your current ticket status",
          "`!close [reason]` — Close your ticket",
          "`!reopen` — Reopen a resolved ticket",
          "`!help` — Show this message",
        ].join("\n"),
      },
      {
        name: "ℹ️  How it works",
        value:
          "Every message you send here is forwarded to our support team. Their replies appear here in your DMs.",
      }
    )
    .setFooter({
      text: `${footer.text} · We typically respond within a few hours`,
      ...(footer.iconURL ? { iconURL: footer.iconURL } : {}),
    });

  await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}
