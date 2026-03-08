import type { WorkingHour } from "./types";

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
 * Returns the next opening time as a Discord relative timestamp string.
 * Uses `<t:UNIX:R>` (relative) and `<t:UNIX:f>` (full date+time) so every
 * user sees the correct time in their own timezone.
 * Falls back to a plain-text string when no opening time can be determined.
 */
export function nextOpeningTime(
  hours: WorkingHour[],
  timezone: string
): string {
  const now = new Date();
  const { dayOfWeek, hour, minute } = getCurrentTimeInZone(timezone);
  const currentMinutes = hour * 60 + minute;

  // Check up to 7 days ahead (including today for "later today")
  for (let offset = 0; offset < 7; offset++) {
    const checkDay = (dayOfWeek + offset) % 7;
    const entry = hours.find((h) => h.day_of_week === checkDay);

    if (!entry || entry.closed_all_day) continue;

    if (entry.open_all_day) {
      if (offset === 0) return "now";
      // Open all day → use midnight (00:00) as the opening time
      const unix = getUnixForOffset(now, offset, 0, 0, timezone);
      return `<t:${unix}:R> (<t:${unix}:f>)`;
    }

    const openAt = (entry.open_hour ?? 0) * 60 + (entry.open_minutes ?? 0);
    // Today: skip if we're already past (or at) the opening time
    if (offset === 0 && currentMinutes >= openAt) continue;

    const unix = getUnixForOffset(
      now, offset, entry.open_hour ?? 0, entry.open_minutes ?? 0, timezone
    );
    return `<t:${unix}:R> (<t:${unix}:f>)`;
  }

  return "soon";
}

/**
 * Compute a Unix timestamp (seconds) for a target time that is `offsetDays`
 * days from now in the given timezone, at the specified hour and minute.
 */
function getUnixForOffset(
  now: Date,
  offsetDays: number,
  targetHour: number,
  targetMinute: number,
  timezone: string,
): number {
  // Build an approximate target date in UTC, then adjust so it hits the
  // desired wall-clock hour in the inbox's timezone.
  const target = new Date(now.getTime() + offsetDays * 86_400_000);

  // Format target date parts in the inbox timezone to get the calendar date
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateParts = fmt.format(target);        // "2026-03-09"
  const iso = `${dateParts}T${String(targetHour).padStart(2, "0")}:${String(targetMinute).padStart(2, "0")}:00`;

  // Use a formatter to resolve the UTC offset for that exact wall-clock time
  const utcGuess = new Date(iso + "Z");

  // Get the offset between UTC and the target timezone at this moment
  const inTz = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(utcGuess);

  const get = (type: string) => parseInt(
    inTz.find((p) => p.type === type)?.value ?? "0", 10
  );

  const tzHour = get("hour") === 24 ? 0 : get("hour");
  const tzMinute = get("minute");

  // Difference in minutes between what we wanted and what the timezone shows
  const wantedMinutes = targetHour * 60 + targetMinute;
  const gotMinutes = tzHour * 60 + tzMinute;
  let diffMinutes = gotMinutes - wantedMinutes;

  // Normalize to ±720 minutes to handle day-boundary wraps
  if (diffMinutes > 720) diffMinutes -= 1440;
  if (diffMinutes < -720) diffMinutes += 1440;

  // Adjust: if timezone showed a later time than desired, we went too far → subtract
  const corrected = new Date(utcGuess.getTime() - diffMinutes * 60_000);
  return Math.floor(corrected.getTime() / 1000);
}
