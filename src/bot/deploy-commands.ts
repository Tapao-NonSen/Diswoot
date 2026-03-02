import { REST, Routes } from "discord.js";

// Load env manually (Bun reads .env automatically)
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID must be set in .env");
  process.exit(1);
}

// Import command builders
const { data: closeCmd } = await import("./commands/close");
const { data: reopenCmd } = await import("./commands/reopen");
const { data: statusCmd } = await import("./commands/status");
const { data: helpCmd } = await import("./commands/help");

const commands = [
  closeCmd.toJSON(),
  reopenCmd.toJSON(),
  statusCmd.toJSON(),
  helpCmd.toJSON(),
];

const rest = new REST({ version: "10" }).setToken(token);

console.log(`Registering ${commands.length} global slash commands…`);

await rest.put(Routes.applicationCommands(clientId), { body: commands });

console.log("Done. Global commands may take up to 1 hour to propagate.");
