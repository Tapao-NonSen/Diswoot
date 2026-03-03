import { EmbedBuilder } from "discord.js";
import { config } from "../config";

const { colors } = config;

/** Builds the branded footer object from BRAND_* env vars. */
export function brandFooter() {
  const { brand } = config;
  const text = brand.footerText || brand.name;
  return brand.iconUrl ? { text, iconURL: brand.iconUrl } : { text };
}

/** Pre-styled embed builders using config color palette and brand footer. */
export const Embeds = {
  /** Pastel mint — ticket opened, reopened, positive confirmation. */
  success(description: string) {
    return new EmbedBuilder()
      .setColor(colors.success)
      .setDescription(`✅  ${description}`)
      .setTimestamp()
      .setFooter(brandFooter());
  },

  /** Pastel rose — ticket closed, error occurred. */
  danger(description: string) {
    return new EmbedBuilder()
      .setColor(colors.danger)
      .setDescription(`❌  ${description}`)
      .setTimestamp()
      .setFooter(brandFooter());
  },

  /** Pastel amber — no-op, already open/closed, non-critical notice. */
  warning(description: string) {
    return new EmbedBuilder()
      .setColor(colors.warning)
      .setDescription(`⚠️  ${description}`)
      .setTimestamp()
      .setFooter(brandFooter());
  },

  /** Pastel lavender — status display, informational with timestamp. */
  info(title: string, description?: string) {
    return new EmbedBuilder()
      .setColor(colors.info)
      .setTitle(title)
      .setDescription(description ?? null)
      .setFooter(brandFooter())
      .setTimestamp();
  },

  /** Pastel blue — primary branded embed. */
  primary(title: string, description?: string) {
    return new EmbedBuilder()
      .setColor(colors.primary)
      .setTitle(title)
      .setDescription(description ?? null)
      .setTimestamp()
      .setFooter(brandFooter());
  },
};
