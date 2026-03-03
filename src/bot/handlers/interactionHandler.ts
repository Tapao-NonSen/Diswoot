import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Interaction } from "discord.js";
import { Embeds } from "../embed";
import { hasCsatResponse, saveCsatResponse } from "../../db/queries";
import { submitCsatRating } from "../../chatwoot/client";

export async function handleInteraction(
  interaction: Interaction
): Promise<void> {
  // ── CSAT button ───────────────────────────────────────────────────────────
  if (!interaction.isButton() || !interaction.customId.startsWith("csat_")) return;

  // Format: "csat_{uuid}_{rating}" — uuid contains hyphens so we extract
  // rating from the end and uuid from the middle.
  const match = interaction.customId.match(/^csat_(.+)_(\d)$/);
  const convUuid = match?.[1] ?? "";
  const rating = Number(match?.[2]);

  if (!convUuid || !rating) {
    await interaction.reply({ embeds: [Embeds.danger("Invalid rating.")], ephemeral: true }).catch(() => {});
    return;
  }

  if (hasCsatResponse(convUuid)) {
    await interaction.reply({ embeds: [Embeds.warning("You've already submitted a rating for this ticket.")], ephemeral: true }).catch(() => {});
    return;
  }

  saveCsatResponse(convUuid, interaction.user.id, rating);

  // Submit to Chatwoot's native CSAT API so it appears in CSAT reports
  await submitCsatRating(convUuid, rating).catch(() => {});

  // Disable all buttons and show confirmation
  const stars = "⭐".repeat(rating);
  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    [1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder()
        .setCustomId(`csat_done_${n}`)
        .setLabel(`${n} ⭐`)
        .setStyle(n === rating ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(true)
    )
  );

  await interaction.update({
    embeds: [Embeds.success(`Thanks for your feedback! You rated us **${rating}/5** ${stars}`)],
    components: [disabledRow],
  }).catch(() => {});
}
