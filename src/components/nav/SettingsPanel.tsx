import { Moon, Sun, ChevronRight, BookOpen, Bell, Trash2, Mail, Shield, FileText, LifeBuoy, Heart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ProfilePictureUpload } from "@/components/ProfilePictureUpload";
import { Capacitor } from "@capacitor/core";
import { useState } from "react";
import { getSettings, saveSettings, scheduleReminder, cancelReminder, type ReminderSettings } from "@/lib/weightReminder";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  userEmail: string;
  avatarUrl: string | null;
  editedName: string;
  setEditedName: (name: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onAvatarChange: (url: string) => void;
  onSave: () => void;
  onReplayTutorial: () => void;
  onDeleteAccount: () => void;
}

export function SettingsPanel({
  open, onClose,
  userName, userEmail, avatarUrl,
  editedName, setEditedName,
  theme, onToggleTheme,
  onAvatarChange, onSave,
  onReplayTutorial,
  onDeleteAccount,
}: SettingsPanelProps) {
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(getSettings);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  if (!open) return null;

  const handleToggle = async (checked: boolean) => {
    const next = { ...reminderSettings, enabled: checked };
    setReminderSettings(next);
    saveSettings(next);
    if (checked) {
      await scheduleReminder(next.hour, next.minute);
    } else {
      await cancelReminder();
      setTimePickerOpen(false);
    }
  };

  const handleTimeChange = async (field: "hour12" | "minute" | "ampm", value: number | string) => {
    let { hour, minute } = reminderSettings;
    const currentAmpm = hour < 12 ? "AM" : "PM";
    let hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

    if (field === "hour12") hour12 = value as number;
    if (field === "minute") minute = value as number;
    const newAmpm = field === "ampm" ? (value as string) : currentAmpm;

    if (newAmpm === "AM") {
      hour = hour12 === 12 ? 0 : hour12;
    } else {
      hour = hour12 === 12 ? 12 : hour12 + 12;
    }

    const next: ReminderSettings = { enabled: true, hour, minute };
    setReminderSettings(next);
    saveSettings(next);
    await scheduleReminder(hour, minute);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[10001] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-[10002] bg-background/95 dark:bg-background/98 backdrop-blur-md border-t border-border/50 rounded-t-3xl animate-in slide-in-from-bottom duration-300 safe-area-inset-bottom flex flex-col" style={{ maxHeight: "85dvh" }}>
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
        </div>
        <div className="px-5 pb-2 pt-1 shrink-0">
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        </div>

        <div className="px-4 space-y-3 overflow-y-auto overscroll-contain" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}>
          {/* Profile Picture + Name row */}
          <div className="rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/50 dark:border-white/10 p-4">
            <div className="flex items-center gap-4">
              <div className="shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="h-14 w-14 rounded-full object-cover border-2 border-primary/20" />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-muted/50 border-2 border-border/50 flex items-center justify-center">
                    <span className="text-xl font-bold text-muted-foreground">{(userName || "?")[0]?.toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <Input
                  id="name"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  placeholder="Your name"
                  className="h-10 rounded-xl bg-background/60 dark:bg-white/5 border-border/40 text-sm font-medium"
                />
                <ProfilePictureUpload
                  currentAvatarUrl={avatarUrl || undefined}
                  onUploadSuccess={onAvatarChange}
                />
              </div>
            </div>
          </div>

          {/* Email */}
          {userEmail && (
            <div className="rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/50 dark:border-white/10 overflow-hidden">
              <div className="flex items-center px-4 py-3 gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                  <Mail className="h-5 w-5 text-primary" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-foreground">Email</p>
                  <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                </div>
              </div>
            </div>
          )}

          {/* Appearance */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/50 dark:border-white/10 overflow-hidden active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation text-left"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                  {theme === "light" ? (
                    <Sun className="h-5 w-5 text-primary" />
                  ) : (
                    <Moon className="h-5 w-5 text-primary" />
                  )}
                </span>
                <div>
                  <p className="text-[15px] font-medium text-foreground">Appearance</p>
                  <p className="text-xs text-muted-foreground">{theme === "dark" ? "Dark mode" : "Light mode"}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </div>
          </button>

          {/* Weight Reminder (native only) */}
          {Capacitor.isNativePlatform() && (() => {
            const h = reminderSettings.hour;
            const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
            const ampm = h < 12 ? "AM" : "PM";
            const displayMinute = String(reminderSettings.minute).padStart(2, "0");
            const timeLabel = `Daily at ${displayHour}:${displayMinute} ${ampm}`;

            return (
              <div className="rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/50 dark:border-white/10 overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation cursor-pointer"
                  onClick={() => { if (reminderSettings.enabled) setTimePickerOpen(!timePickerOpen); }}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                      <Bell className="h-5 w-5 text-primary" />
                    </span>
                    <div>
                      <p className="text-[15px] font-medium text-foreground">Weight Reminder</p>
                      <p className="text-xs text-muted-foreground">
                        {reminderSettings.enabled ? timeLabel : "Off"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={reminderSettings.enabled}
                    onCheckedChange={handleToggle}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {timePickerOpen && reminderSettings.enabled && (() => {
                  const curHour24 = reminderSettings.hour;
                  const curHour12 = curHour24 === 0 ? 12 : curHour24 > 12 ? curHour24 - 12 : curHour24;
                  const curAmpm = curHour24 < 12 ? "AM" : "PM";

                  const selectClass = "h-10 rounded-xl bg-background/60 dark:bg-white/5 border border-border/40 text-sm font-medium px-3 appearance-none text-foreground";

                  return (
                    <div className="flex items-center gap-2 px-4 pb-3 pt-1">
                      <select
                        value={curHour12}
                        onChange={(e) => handleTimeChange("hour12", Number(e.target.value))}
                        className={selectClass}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <span className="text-muted-foreground font-medium">:</span>
                      <select
                        value={reminderSettings.minute}
                        onChange={(e) => handleTimeChange("minute", Number(e.target.value))}
                        className={selectClass}
                      >
                        {[0, 15, 30, 45].map((m) => (
                          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                        ))}
                      </select>
                      <select
                        value={curAmpm}
                        onChange={(e) => handleTimeChange("ampm", e.target.value)}
                        className={selectClass}
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Replay Tutorial */}
          <button
            type="button"
            onClick={onReplayTutorial}
            className="w-full rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/50 dark:border-white/10 overflow-hidden active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation text-left"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                  <BookOpen className="h-5 w-5 text-primary" />
                </span>
                <div>
                  <p className="text-[15px] font-medium text-foreground">Replay Tutorial</p>
                  <p className="text-xs text-muted-foreground">Walk through the app again</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </div>
          </button>

          {/* Legal & Support */}
          <div className="rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/50 dark:border-white/10 overflow-hidden divide-y divide-border/30 dark:divide-white/5">
            <a
              href="https://weightcutwizard.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                  <Shield className="h-5 w-5 text-primary" />
                </span>
                <div>
                  <p className="text-[15px] font-medium text-foreground">Privacy Policy</p>
                  <p className="text-xs text-muted-foreground">How we handle your data</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </a>

            <a
              href="https://weightcutwizard.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                  <FileText className="h-5 w-5 text-primary" />
                </span>
                <div>
                  <p className="text-[15px] font-medium text-foreground">Terms of Service</p>
                  <p className="text-xs text-muted-foreground">Usage terms and conditions</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </a>

            <a
              href="mailto:weightcutwizard@gmail.com"
              className="flex items-center justify-between px-4 py-3 active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                  <LifeBuoy className="h-5 w-5 text-primary" />
                </span>
                <div>
                  <p className="text-[15px] font-medium text-foreground">Support</p>
                  <p className="text-xs text-muted-foreground">weightcutwizard@gmail.com</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </a>
          </div>

          {/* Medical Disclaimer */}
          <div className="rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/50 dark:border-white/10 overflow-hidden">
            <div className="flex items-start gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 dark:bg-amber-500/15 mt-0.5">
                <Heart className="h-5 w-5 text-amber-500" />
              </span>
              <div>
                <p className="text-[15px] font-medium text-foreground">Medical Disclaimer</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  This app is for informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always consult a qualified healthcare provider before making changes to your diet, training, or weight management plan.
                </p>
              </div>
            </div>
          </div>

          {/* Delete Account */}
          <button
            type="button"
            onClick={onDeleteAccount}
            className="w-full rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/50 dark:border-white/10 overflow-hidden active:bg-muted/50 dark:active:bg-white/10 transition-colors touch-manipulation text-left"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 dark:bg-destructive/15">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </span>
                <div>
                  <p className="text-[15px] font-medium text-destructive">Delete Account</p>
                  <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </div>
          </button>

          {/* Save */}
          <Button
            onClick={onSave}
            className="w-full h-11 rounded-2xl text-base font-bold bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/20"
          >
            Save Changes
          </Button>

          <p className="text-center text-xs text-muted-foreground/50 pt-1">v{__APP_VERSION__}</p>
        </div>
      </div>
    </>
  );
}
