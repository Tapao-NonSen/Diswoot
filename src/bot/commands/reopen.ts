import { type Message } from "discord.js";
import { Embeds } from "../embed";
import { getMapping } from "../../db/queries";
import { getConversation, toggleStatus, sendNote } from "../../chatwoot/client";

export async function execute(message: Message): Promise<void> {
  const mapping = getMapping(message.author.id);
  if (!mapping) {
    await message.reply({
      embeds: [
        Embeds.warning(
          "You don't have a support ticket yet. Just send a message to open one."
        ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const conv = await getConversation(mapping.chatwoot_conv_id);
  if (conv.status === "open" || conv.status === "pending") {
    await message.reply({
      embeds: [
        Embeds.warning(
          "Your ticket is already open — an agent will respond soon."
        ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  await toggleStatus(mapping.chatwoot_conv_id, "open");
  await sendNote(
    mapping.chatwoot_conv_id,
    "User reopened the ticket via Discord command."
  );

  await message.reply({
    embeds: [
      Embeds.success(
        "Your ticket has been reopened. An agent will be with you soon."
      ),
    ],
    allowedMentions: { repliedUser: false },
  });
}
