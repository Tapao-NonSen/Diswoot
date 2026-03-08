import { type Message } from "discord.js";
import { Embeds } from "../embed";
import { getMapping, markBotResolved } from "../../db/queries";
import { getConversation, toggleStatus, sendNote } from "../../chatwoot/client";
import { isChatwootHealthy } from "../../chatwoot/health";

export async function execute(message: Message, args: string[]): Promise<void> {
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
      embeds: [Embeds.warning("You don't have an open support ticket.")],
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

  if (conv.status === "resolved") {
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
  // Mark as bot-resolved so the webhook handler skips the duplicate DM
  markBotResolved(mapping.chatwoot_conv_id);
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
