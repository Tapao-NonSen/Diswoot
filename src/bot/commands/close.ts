import { type Message } from "discord.js";
import { Embeds } from "../embed";
import { getMapping } from "../../db/queries";
import { getConversation, toggleStatus, sendNote } from "../../chatwoot/client";

export async function execute(message: Message, args: string[]): Promise<void> {
  const mapping = getMapping(message.author.id);
  if (!mapping) {
    await message.reply({
      embeds: [Embeds.warning("You don't have an open support ticket.")],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const conv = await getConversation(mapping.chatwoot_conv_id);
  if (conv.status === "resolved" || conv.status === "snoozed") {
    await message.reply({
      embeds: [Embeds.warning("Your ticket is already closed.")],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const reason = args.join(" ").trim() || null;
  const noteContent = reason
    ? `User closed the ticket via Discord. Reason: ${reason}`
    : "User closed the ticket via Discord.";

  await sendNote(mapping.chatwoot_conv_id, noteContent);
  await toggleStatus(mapping.chatwoot_conv_id, "resolved");

  await message.reply({
    embeds: [
      Embeds.danger(
        "Your ticket has been closed. DM us again if you need further help."
      ),
    ],
    allowedMentions: { repliedUser: false },
  });
}
