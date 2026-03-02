import { ChannelType, type Interaction } from "discord.js";
import { Embeds } from "../embed";
import { execute as closeExecute } from "../commands/close";
import { execute as reopenExecute } from "../commands/reopen";
import { execute as statusExecute } from "../commands/status";
import { execute as helpExecute } from "../commands/help";

const commands: Record<
  string,
  (i: Parameters<typeof closeExecute>[0]) => Promise<void>
> = {
  close: closeExecute,
  reopen: reopenExecute,
  status: statusExecute,
  help: helpExecute,
};

export async function handleInteraction(
  interaction: Interaction
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  // Only handle commands issued in DMs
  if (interaction.channel?.type !== ChannelType.DM) {
    await interaction
      .reply({
        embeds: [Embeds.warning("These commands only work in DMs with this bot.")],
        ephemeral: true,
      })
      .catch(() => {});
    return;
  }

  const handler = commands[interaction.commandName];
  if (!handler) return;

  try {
    await handler(interaction);
  } catch (err) {
    console.error(`[interactionHandler] /${interaction.commandName}:`, err);
    const method = interaction.deferred ? "editReply" : "reply";
    await interaction[method]({
      embeds: [Embeds.danger("Something went wrong. Please try again.")],
      ephemeral: true,
    }).catch(() => {});
  }
}
