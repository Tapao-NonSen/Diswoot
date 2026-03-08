import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Interaction,
} from "discord.js";
import { Embeds } from "../embed";
import { config } from "../../config";
import { hasCsatResponse, saveCsatResponse, updateCsatFeedback } from "../../db/queries";
import { submitCsatRating } from "../../chatwoot/client";
import { enqueueCsat } from "../../lib/retryQueue";

export async function handleInteraction(
  interaction: Interaction
): Promise<void> {
  // ── "Rate us" button → open CSAT modal ────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("csat_rate_")) {
    // Format: "csat_rate_{uuid}"
    const convUuid = interaction.customId.slice("csat_rate_".length);

    if (!convUuid) {
      await interaction.reply({ embeds: [Embeds.danger("Invalid survey.")], ephemeral: true }).catch(() => {});
      return;
    }

    if (hasCsatResponse(convUuid)) {
      await interaction.reply({ embeds: [Embeds.warning("You've already submitted a rating for this ticket.")], ephemeral: true }).catch(() => {});
      return;
    }

    // Build modal with rating input + optional message input
    const modal = new ModalBuilder()
      .setCustomId(`csat_modal_${convUuid}`)
      .setTitle("⭐  Rate Your Experience");

    const ratingInput = new TextInputBuilder()
      .setCustomId("csat_rating")
      .setLabel("Rating (1–5 stars)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(1)
      .setPlaceholder("Enter a number from 1 to 5");

    const rows: ActionRowBuilder<TextInputBuilder>[] = [
      new ActionRowBuilder<TextInputBuilder>().addComponents(ratingInput),
    ];

    if (config.ux.csatCommentEnabled) {
      const messageInput = new TextInputBuilder()
        .setCustomId("csat_message")
        .setLabel(config.ux.csatCommentPlaceholder)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)
        .setPlaceholder("Share your thoughts… (optional)");

      rows.push(
        new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput)
      );
    }

    modal.addComponents(...rows);
    await interaction.showModal(modal).catch(() => {});
    return;
  }

  // ── CSAT modal submitted ──────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith("csat_modal_")) {
    // Format: "csat_modal_{uuid}"
    const convUuid = interaction.customId.slice("csat_modal_".length);

    if (!convUuid) {
      await interaction.reply({ embeds: [Embeds.danger("Invalid submission.")], ephemeral: true }).catch(() => {});
      return;
    }

    if (hasCsatResponse(convUuid)) {
      await interaction.reply({ embeds: [Embeds.warning("You've already submitted a rating for this ticket.")], ephemeral: true }).catch(() => {});
      return;
    }

    // Parse and validate rating
    const ratingRaw = interaction.fields.getTextInputValue("csat_rating").trim();
    const rating = Number(ratingRaw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      await interaction.reply({
        embeds: [Embeds.danger("Please enter a valid rating between **1** and **5**.")],
        ephemeral: true,
      }).catch(() => {});
      return;
    }

    // Optional feedback message
    let feedbackMessage = "";
    try {
      feedbackMessage = interaction.fields.getTextInputValue("csat_message").trim();
    } catch {
      // Field not present (comment disabled) — ignore
    }

    // Save to local DB
    saveCsatResponse(convUuid, interaction.user.id, rating);
    if (feedbackMessage) {
      updateCsatFeedback(convUuid, feedbackMessage);
    }

    // Submit to Chatwoot's native CSAT API
    try {
      await submitCsatRating(convUuid, rating, feedbackMessage);
    } catch (err) {
      // Chatwoot locks CSAT after 14 days — inform the user gracefully
      if (err instanceof Error && err.message.startsWith("CSAT_LOCKED")) {
        console.warn(`[csat] Survey ${convUuid} is locked (>14 days old)`);
        await interaction.reply({
          embeds: [Embeds.warning("This survey has expired and can no longer be submitted.")],
          ephemeral: true,
        }).catch(() => {});
        return;
      }
      console.error(`[csat] Failed to submit to Chatwoot for ${convUuid} — queuing:`, err);
      enqueueCsat(convUuid, rating, feedbackMessage);
    }

    // Build confirmation
    const stars = "⭐".repeat(rating);
    const description = feedbackMessage
      ? `Thanks for your feedback! You rated us **${rating}/5** ${stars}\n\n💬  *"${feedbackMessage}"*`
      : `Thanks for your feedback! You rated us **${rating}/5** ${stars}`;

    // Disable the "Rate us" button on the original message
    if (interaction.message) {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("csat_done")
          .setLabel(`Rated ${rating}/5 ${stars}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
      );
      await interaction.message.edit({
        embeds: [Embeds.success(description)],
        components: [disabledRow],
      }).catch(() => {});
    }

    // Acknowledge the modal
    await interaction.reply({
      embeds: [Embeds.success("Your feedback has been submitted. Thank you! 🎉")],
      ephemeral: true,
    }).catch(() => {});
    return;
  }
}
