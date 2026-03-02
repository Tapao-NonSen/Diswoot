import type { WorkingHour } from "./types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

interface TimeInZone {
  dayOfWeek: number;
  hour: number;
  minute: number;
}

function getCurrentTimeInZone(timezone: string): TimeInZone {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";

  // hour12: false can return "24" for midnight in some locales — normalize it
  const rawHour = parseInt(get("hour"), 10);

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    dayOfWeek: dayMap[get("weekday")] ?? 0,
    hour: rawHour === 24 ? 0 : rawHour,
    minute: parseInt(get("minute"), 10),
  };
}

/**
 * Returns true if the current time (in the inbox timezone) falls within
 * a configured working-hours window. Always returns true when
 * working_hours_enabled is false (no restrictions configured).
 */
export function isWithinWorkingHours(
  hours: WorkingHour[],
  timezone: string,
  enabled: boolean
): boolean {
  if (!enabled || !hours.length) return true;

  const { dayOfWeek, hour, minute } = getCurrentTimeInZone(timezone);
  const today = hours.find((h) => h.day_of_week === dayOfWeek);

  if (!today || today.closed_all_day) return false;
  if (today.open_all_day) return true;

  const current = hour * 60 + minute;
  // open_hour/close_hour are null when closed_all_day — guard already passed above
  const open = (today.open_hour ?? 0) * 60 + (today.open_minutes ?? 0);
  const close = (today.close_hour ?? 0) * 60 + (today.close_minutes ?? 0);

  return current >= open && current < close;
}

/**
 * Returns a human-readable string for when support next opens.
 * Examples: "today at 09:00", "tomorrow at 09:00", "Mon at 09:00"
 */
export function nextOpeningTime(
  hours: WorkingHour[],
  timezone: string
): string {
  const { dayOfWeek, hour, minute } = getCurrentTimeInZone(timezone);
  const currentMinutes = hour * 60 + minute;

  // Check up to 7 days ahead (including today for "later today")
  for (let offset = 0; offset < 7; offset++) {
    const checkDay = (dayOfWeek + offset) % 7;
    const entry = hours.find((h) => h.day_of_week === checkDay);

    if (!entry || entry.closed_all_day) continue;

    if (entry.open_all_day) {
      if (offset === 0) return "now";
      if (offset === 1) return "tomorrow";
      return DAY_NAMES[checkDay] ?? "soon";
    }

    const openAt = (entry.open_hour ?? 0) * 60 + (entry.open_minutes ?? 0);
    // Today: skip if we're already past (or at) the opening time
    if (offset === 0 && currentMinutes >= openAt) continue;

    const hh = String(entry.open_hour ?? 0).padStart(2, "0");
    const mm = String(entry.open_minutes ?? 0).padStart(2, "0");

    if (offset === 0) return `today at ${hh}:${mm}`;
    if (offset === 1) return `tomorrow at ${hh}:${mm}`;
    return `${DAY_NAMES[checkDay]} at ${hh}:${mm}`;
  }

  return "soon";
}
