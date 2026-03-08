/**
 * ── Diswoot Plugin Interface ────────────────────────────────────────
 *
 * Plugins extend Diswoot without touching core code. Each plugin is a
 * plain object that satisfies this interface and is registered via the
 * plugin registry (`src/plugins/index.ts`).
 *
 * ## Lifecycle
 *
 * 1. `init()` — called once at startup. Return `false` to disable the
 *    plugin silently (e.g. missing env vars).
 * 2. `enrichContact()` — called before a Chatwoot contact is
 *    created / updated. Returned fields are **merged** into the
 *    Chatwoot request (later plugins override earlier ones).
 * 3. `shutdown()` — called during graceful shutdown.
 *
 * All hooks are optional. A minimal plugin only needs `name`.
 * ────────────────────────────────────────────────────────────────────
 */

// ── Data passed to enrichContact ─────────────────────────────────────

export interface DiscordUserInfo {
  /** Discord snowflake user ID */
  id: string;
  /** Discord username (e.g. "john") */
  username: string;
  /** Display name (guild nick or global name) */
  displayName: string;
  /** Avatar URL (may be null) */
  avatarURL: string | null;
}

// ── Data returned from enrichContact ─────────────────────────────────

export interface ContactEnrichment {
  /** Contact email to set on the Chatwoot contact */
  email?: string;
  /** Extra key-value pairs to merge into `custom_attributes` */
  customAttributes?: Record<string, string>;
}

// ── Plugin contract ──────────────────────────────────────────────────

export interface DiswootPlugin {
  /** Unique human-readable name (used in logs) */
  readonly name: string;

  /**
   * Called once at startup. Perform validation, open connections, etc.
   *
   * - Return `true` (or `void`) to keep the plugin active.
   * - Return `false` to silently disable it (e.g. missing config).
   * - Throwing disables the plugin and logs the error.
   */
  init?(): Promise<boolean | void> | boolean | void;

  /**
   * Called before a Chatwoot contact is created or updated.
   * Returned fields are **shallow-merged** into the API request.
   *
   * Plugins run sequentially; later plugins can override earlier ones.
   * Return `null` / `undefined` to contribute nothing.
   */
  enrichContact?(
    user: DiscordUserInfo
  ): Promise<ContactEnrichment | null | undefined> | ContactEnrichment | null | undefined;

  /** Called during graceful shutdown. */
  shutdown?(): Promise<void> | void;
}
