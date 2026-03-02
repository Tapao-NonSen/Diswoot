import { ActivityType } from "discord.js";
import { discordClient } from "./client";
import { config } from "../config";
import { getCachedInbox } from "../chatwoot/inboxCache";
import { isWithinWorkingHours, nextOpeningTime } from "../chatwoot/workingHours";

export async function updatePresence(): Promise<void> {
  const inbox = await getCachedInbox();
  if (!inbox || !discordClient.user) return;

  const online = isWithinWorkingHours(
    inbox.working_hours,
    inbox.timezone,
    inbox.working_hours_enabled
  );

  if (online) {
    discordClient.user.setPresence({
      status: "online",
      activities: [
        { name: config.presence.onlineText, type: ActivityType.Watching },
      ],
    });
  } else {
    const next = nextOpeningTime(inbox.working_hours, inbox.timezone);
    discordClient.user.setPresence({
      status: "idle",
      activities: [
        {
          name: `${config.presence.offlineText} · Returns ${next}`,
          type: ActivityType.Watching,
        },
      ],
    });
  }
}

export function startPresencePoller(): void {
  updatePresence();
  setInterval(updatePresence, config.presence.pollIntervalMs);
}
