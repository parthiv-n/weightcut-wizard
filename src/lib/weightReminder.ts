import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const REMINDER_ID = 9001;
const STORAGE_KEY = "weight_reminder_settings";

export interface ReminderSettings {
  enabled: boolean;
  hour: number;
  minute: number;
}

const DEFAULT_SETTINGS: ReminderSettings = { enabled: false, hour: 7, minute: 0 };

export function getSettings(): ReminderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ReminderSettings;
  } catch {
    // corrupted — fall back to defaults
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: ReminderSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export async function scheduleReminder(hour: number, minute: number): Promise<void> {
  // Cancel any existing reminder first so the fixed ID is replaced
  await cancelReminder();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: REMINDER_ID,
        title: "WeightCut Wizard",
        body: "Time to step on the scale ⚖️",
        schedule: { on: { hour, minute }, every: "day" },
        sound: "default",
        actionTypeId: "",
        extra: null,
      },
    ],
  });
}

export async function cancelReminder(): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
}

export async function syncWeightReminder(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const settings = getSettings();
  if (settings.enabled) {
    await scheduleReminder(settings.hour, settings.minute);
  } else {
    await cancelReminder();
  }
}
