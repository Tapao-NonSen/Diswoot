import { type Message } from "discord.js";
import { Embeds } from "../embed";
import { config } from "../../config";
import { getMapping, saveMapping } from "../../db/queries";
import { getConversation, createConversation, toggleStatus, sendNote } from "../../chatwoot/client";

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

  // If the resolved ticket is older than the configured window,
  // start a fresh conversation instead of reopening the stale one.
  const windowHours = config.tickets.reopenWindowHours;
  const isStale =
    windowHours > 0 &&
    conv.status === "resolved" &&
    (Date.now() / 1000 - conv.last_activity_at) > windowHours * 3600;

  if (isStale) {
    const newConvId = await createConversation(
      mapping.chatwoot_source_id,
      mapping.chatwoot_contact_id,
      "open"
    );
    saveMapping(message.author.id, mapping.chatwoot_contact_id, mapping.chatwoot_source_id, newConvId);
    await sendNote(newConvId, "User opened a new ticket via Discord !reopen command (previous ticket expired).");
    await message.reply({
      embeds: [
        Embeds.success(
          "Your previous ticket has expired — a new one has been created. An agent will be with you soon."
        ),
      ],
      allowedMentions: { repliedUser: false },
    });
  } else {
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
}
