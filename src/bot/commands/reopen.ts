import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { Embeds } from "../embed";
import { getMapping } from "../../db/queries";
import { getConversation, toggleStatus, sendNote } from "../../chatwoot/client";

export const data = new SlashCommandBuilder()
  .setName("reopen")
  .setDescription("Reopen your resolved support ticket");

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const mapping = getMapping(interaction.user.id);
  if (!mapping) {
    await interaction.editReply({
      embeds: [
        Embeds.warning(
          "You don't have a support ticket yet. Just send a message to open one."
        ),
      ],
    });
    return;
  }

  const conv = await getConversation(mapping.chatwoot_conv_id);
  if (conv.status === "open" || conv.status === "pending") {
    await interaction.editReply({
      embeds: [
        Embeds.warning(
          "Your ticket is already open — an agent will respond soon."
        ),
      ],
    });
    return;
  }

  await toggleStatus(mapping.chatwoot_conv_id, "open");
  await sendNote(
    mapping.chatwoot_conv_id,
    "User reopened the ticket via Discord command."
  );

  await interaction.editReply({
    embeds: [
      Embeds.success(
        "Your ticket has been reopened. An agent will be with you soon."
      ),
    ],
  });
}
