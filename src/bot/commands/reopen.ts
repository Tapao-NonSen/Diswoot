import { type Message } from "discord.js";
import { Embeds } from "../embed";
import { config } from "../../config";
import { getMapping, saveMapping } from "../../db/queries";
import { getConversation, createConversation, toggleStatus, sendNote } from "../../chatwoot/client";
import { getCachedInbox } from "../../chatwoot/inboxCache";
import { isChatwootHealthy } from "../../chatwoot/health";

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
          "You don't have a support ticket yet. Just send a message to open one."
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

  // Check the Chatwoot inbox lock setting
  const inbox = await getCachedInbox();
  const lockSingle = inbox?.lock_to_single_conversation ?? false;

  // Determine whether the resolved ticket is stale (only when not locked)
  const windowHours = config.tickets.reopenWindowHours;
  const isStale =
    !lockSingle &&
    windowHours > 0 &&
    conv.status === "resolved" &&
    (Date.now() / 1000 - conv.last_activity_at) > windowHours * 3600;

  if (isStale) {
    // Multiple conversations allowed and ticket is stale — create a new one
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
    // Locked to single conversation, or within reopen window — reopen existing
    await toggleStatus(mapping.chatwoot_conv_id, "open");
    await sendNote(
      mapping.chatwoot_conv_id,
      conv.status === "snoozed"
        ? "User reopened a snoozed ticket via Discord command."
        : "User reopened the ticket via Discord command."
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
