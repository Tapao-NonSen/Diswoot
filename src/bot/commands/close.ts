import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { Embeds } from "../embed";
import { getMapping } from "../../db/queries";
import { getConversation, toggleStatus, sendNote } from "../../chatwoot/client";

export const data = new SlashCommandBuilder()
  .setName("close")
  .setDescription("Close your support ticket")
  .addStringOption((opt) =>
    opt
      .setName("reason")
      .setDescription("Optional reason for closing")
      .setRequired(false)
  );

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const mapping = getMapping(interaction.user.id);
  if (!mapping) {
    await interaction.editReply({
      embeds: [Embeds.warning("You don't have an open support ticket.")],
    });
    return;
  }

  const conv = await getConversation(mapping.chatwoot_conv_id);
  if (conv.status === "resolved" || conv.status === "snoozed") {
    await interaction.editReply({
      embeds: [Embeds.warning("Your ticket is already closed.")],
    });
    return;
  }

  const reason = interaction.options.getString("reason");
  const noteContent = reason
    ? `User closed the ticket via Discord. Reason: ${reason}`
    : "User closed the ticket via Discord.";

  await sendNote(mapping.chatwoot_conv_id, noteContent);
  await toggleStatus(mapping.chatwoot_conv_id, "resolved");

  await interaction.editReply({
    embeds: [
      Embeds.danger(
        "Your ticket has been closed. DM us again if you need further help."
      ),
    ],
  });
}
