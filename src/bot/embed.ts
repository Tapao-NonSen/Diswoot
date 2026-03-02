import { EmbedBuilder } from "discord.js";
import { config } from "../config";

const { colors } = config;

/** Pre-styled embed builders using config color palette. */
export const Embeds = {
  /** Green — ticket opened, reopened, message sent OK. */
  success(description: string) {
    return new EmbedBuilder()
      .setColor(colors.success)
      .setDescription(`✅  ${description}`);
  },

  /** Red — ticket closed, error occurred. */
  danger(description: string) {
    return new EmbedBuilder()
      .setColor(colors.danger)
      .setDescription(`❌  ${description}`);
  },

  /** Yellow — no-op (already open, already closed). */
  warning(description: string) {
    return new EmbedBuilder()
      .setColor(colors.warning)
      .setDescription(`⚠️  ${description}`);
  },

  /** Indigo — status display, help. */
  info(title: string, description?: string) {
    return new EmbedBuilder()
      .setColor(colors.info)
      .setTitle(title)
      .setDescription(description ?? null);
  },

  /** Blue — primary branded embed with optional description. */
  primary(title: string, description?: string) {
    return new EmbedBuilder()
      .setColor(colors.primary)
      .setTitle(title)
      .setDescription(description ?? null);
  },
};
