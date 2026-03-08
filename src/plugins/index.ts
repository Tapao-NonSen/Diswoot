/**
 * ── Plugin Registry ─────────────────────────────────────────────────
 *
 * Central registry for all Diswoot plugins. Plugins are imported
 * statically and registered during `loadPlugins()` which runs once
 * at startup (before the Discord client logs in).
 *
 * Adding a new plugin:
 *   1. Create `src/plugins/my-plugin.ts` exporting a `DiswootPlugin`.
 *   2. Import it below and add it to `ALL_PLUGINS`.
 *   3. Done — init / enrichment / shutdown are handled automatically.
 * ────────────────────────────────────────────────────────────────────
 */

import type {
  DiswootPlugin,
  DiscordUserInfo,
  ContactEnrichment,
} from "./types";

// ── Import all available plugins here ────────────────────────────────
import { singltyPlugin } from "./singlty";

/**
 * Master list of every plugin. Each entry is tried during `loadPlugins`;
 * plugins whose `init()` returns `false` or throws are silently skipped.
 */
const ALL_PLUGINS: DiswootPlugin[] = [singltyPlugin];

// ── Active plugins (populated after init) ────────────────────────────
const active: DiswootPlugin[] = [];

// ── Public API ───────────────────────────────────────────────────────

/**
 * Initialise all plugins. Must be called **once** at startup.
 * Plugins whose `init()` returns `false` or throws are excluded.
 */
export async function loadPlugins(): Promise<void> {
  for (const plugin of ALL_PLUGINS) {
    try {
      const result = await plugin.init?.();
      if (result === false) {
        console.log(`[plugins] ⏭  ${plugin.name} — disabled (init returned false)`);
        continue;
      }
      active.push(plugin);
      console.log(`[plugins] ✅  ${plugin.name} — loaded`);
    } catch (err) {
      console.warn(`[plugins] ❌  ${plugin.name} — init failed:`, err);
    }
  }
  console.log(
    `[plugins] ${active.length}/${ALL_PLUGINS.length} plugin(s) active`
  );
}

/**
 * Run every active plugin's `enrichContact` hook and merge the results.
 * Later plugins override earlier ones for the same key.
 */
export async function runEnrichContact(
  user: DiscordUserInfo
): Promise<ContactEnrichment> {
  const merged: ContactEnrichment = { customAttributes: {} };

  for (const plugin of active) {
    if (!plugin.enrichContact) continue;
    try {
      const result = await plugin.enrichContact(user);
      if (!result) continue;

      if (result.email) merged.email = result.email;
      if (result.customAttributes) {
        Object.assign(merged.customAttributes!, result.customAttributes);
      }
    } catch (err) {
      console.warn(`[plugins] ${plugin.name}.enrichContact failed:`, err);
    }
  }

  return merged;
}

/** Graceful shutdown — called from the main shutdown handler. */
export async function shutdownPlugins(): Promise<void> {
  for (const plugin of active) {
    try {
      await plugin.shutdown?.();
    } catch (err) {
      console.warn(`[plugins] ${plugin.name}.shutdown failed:`, err);
    }
  }
}
