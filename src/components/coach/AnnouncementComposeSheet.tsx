import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Check, ImagePlus, Plus, Minus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { celebrateSuccess, triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { logger } from "@/lib/logger";
import { resizeImageToMaxWidthWebp } from "@/lib/imageResize";
import { AthleteAvatar } from "./AthleteAvatar";
import type { AthleteOverviewRow } from "@/hooks/coach/useCoachData";

type Kind = "text" | "image" | "poll";
type Mode = "all" | "specific";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gymId: string;
  gymName: string;
  athletes: AthleteOverviewRow[];
  onSent?: () => void;
}

const MAX_BODY = 2000;
const POLL_OPTION_MAX = 80;
const POLL_QUESTION_MAX = 200;

const EXPIRY_PRESETS: Array<{ label: string; hours: number | null }> = [
  { label: "1h", hours: 1 },
  { label: "1d", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "7d", hours: 168 },
  { label: "Never", hours: null },
];

export function AnnouncementComposeSheet({ open, onOpenChange, gymId, gymName, athletes, onSent }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const tempPathRef = useRef<string | null>(null);

  const [kind, setKind] = useState<Kind>("text");
  const [mode, setMode] = useState<Mode>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollExpiresHours, setPollExpiresHours] = useState<number | null>(24);
  const [sending, setSending] = useState(false);

  const validBody = body.trim().length > 0;
  const validOptions = pollOptions.filter((o) => o.trim()).length >= 2;
  const audienceValid = mode !== "specific" || selected.size > 0;
  const canSend = useMemo(() => {
    if (sending || !audienceValid) return false;
    if (kind === "text") return validBody;
    if (kind === "image") return !!imageUrl && !imageUploading;
    return validBody && validOptions;
  }, [sending, audienceValid, kind, validBody, validOptions, imageUrl, imageUploading]);

  const remaining = (kind === "poll" ? POLL_QUESTION_MAX : MAX_BODY) - body.length;

  const reset = () => {
    setKind("text");
    setMode("all");
    setSelected(new Set());
    setBody("");
    setImageUrl(null);
    setImageUploading(false);
    setPollOptions(["", ""]);
    setPollExpiresHours(24);
    tempPathRef.current = null;
  };

  // Fire-and-forget orphan-image cleanup
  const deleteOrphanImage = async () => {
    const path = tempPathRef.current;
    if (!path) return;
    tempPathRef.current = null;
    setImageUrl(null);
    try {
      await supabase.storage.from("announcement-images").remove([path]);
    } catch {}
  };

  // Cleanup orphan when sheet closes without sending
  useEffect(() => {
    if (!open && tempPathRef.current && !sending) {
      void deleteOrphanImage();
    }
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const switchKind = (next: Kind) => {
    if (next === kind) return;
    triggerHaptic(ImpactStyle.Light);
    if (kind === "image" && tempPathRef.current) void deleteOrphanImage();
    if (next !== "poll") {
      setPollOptions(["", ""]);
      setPollExpiresHours(24);
    }
    setKind(next);
  };

  const toggleSelected = (userId: string) => {
    triggerHaptic(ImpactStyle.Light);
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(userId)) n.delete(userId);
      else n.add(userId);
      return n;
    });
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      toast({ title: "Pick an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Keep it under 5MB", variant: "destructive" });
      return;
    }

    setImageUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("File read failed"));
        r.readAsDataURL(file);
      });
      const blob = await resizeImageToMaxWidthWebp(dataUrl, 1080, 0.82);
      const tempUuid = crypto.randomUUID();
      const path = `${gymId}/${tempUuid}.webp`;
      const { error: upErr } = await supabase.storage
        .from("announcement-images")
        .upload(path, blob, { contentType: "image/webp", upsert: true, cacheControl: "86400" });
      if (upErr) throw upErr;
      // If we had a previous orphan image in this session, clean it up
      if (tempPathRef.current && tempPathRef.current !== path) {
        const old = tempPathRef.current;
        supabase.storage.from("announcement-images").remove([old]).then(() => {});
      }
      tempPathRef.current = path;
      const { data: pub } = supabase.storage.from("announcement-images").getPublicUrl(path);
      setImageUrl(`${pub.publicUrl}?v=${Date.now()}`);
    } catch (err: any) {
      logger.error("Compose: image upload failed", err);
      toast({ title: "Could not upload image", description: err?.message, variant: "destructive" });
    } finally {
      setImageUploading(false);
    }
  };

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    triggerHaptic(ImpactStyle.Medium);
    try {
      const targets = mode === "specific" ? Array.from(selected) : null;
      const expiresAt =
        kind === "poll" && pollExpiresHours != null
          ? new Date(Date.now() + pollExpiresHours * 3600_000).toISOString()
          : null;

      const args = {
        p_gym_id: gymId,
        p_body: body.trim(),
        p_target_user_ids: targets,
        p_kind: kind,
        p_image_url: kind === "image" ? imageUrl : null,
        p_poll_options:
          kind === "poll" ? pollOptions.map((o) => o.trim()).filter(Boolean) : null,
        p_expires_at: expiresAt,
      };

      const { error } = await supabase.rpc("create_announcement", args);
      if (error) throw error;

      // Successful send → clear orphan ref so cleanup doesn't delete the live image
      tempPathRef.current = null;

      celebrateSuccess();
      toast({
        title:
          kind === "poll" ? "Poll opened" : kind === "image" ? "Image posted" : "Announcement sent",
        description:
          mode === "all"
            ? `Broadcast to all athletes in ${gymName}`
            : `Sent to ${selected.size} athlete${selected.size === 1 ? "" : "s"}`,
      });
      onOpenChange(false);
      onSent?.();
    } catch (err: any) {
      logger.error("Compose: send failed", err);
      toast({ title: "Could not send", description: err?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const updateOption = (i: number, v: string) =>
    setPollOptions((p) => p.map((x, j) => (j === i ? v : x)));
  const removeOption = (i: number) =>
    setPollOptions((p) => (p.length <= 2 ? p : p.filter((_, j) => j !== i)));
  const addOption = () => setPollOptions((p) => (p.length >= 6 ? p : [...p, ""]));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] [&>button]:hidden max-h-[88vh] flex flex-col"
      >
        <div className="flex justify-center pt-1 pb-3 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/25" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-1 pb-3 shrink-0 gap-3">
          <SheetHeader className="text-left flex-1 min-w-0">
            <SheetTitle className="text-base font-semibold">New announcement</SheetTitle>
            <p className="text-[12px] text-muted-foreground truncate">{gymName}</p>
          </SheetHeader>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="h-9 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold active:scale-[0.95] transition-transform disabled:opacity-40 flex items-center justify-center gap-1.5 flex-shrink-0"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <><Send className="h-3 w-3" /> Send</>
            )}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 px-1">
          {/* Kind segmented control */}
          <div className="flex bg-muted/40 dark:bg-white/[0.06] rounded-2xl p-1 border border-border/40">
            {(["text", "image", "poll"] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => switchKind(k)}
                className={`flex-1 h-9 rounded-xl text-[12px] font-medium capitalize transition-all ${
                  kind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Audience segmented control */}
          <div className="flex bg-muted/40 dark:bg-white/[0.06] rounded-2xl p-1 border border-border/40">
            <button
              type="button"
              onClick={() => setMode("all")}
              className={`flex-1 h-9 rounded-xl text-[12px] font-medium transition-all ${
                mode === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              All athletes
            </button>
            <button
              type="button"
              onClick={() => setMode("specific")}
              className={`flex-1 h-9 rounded-xl text-[12px] font-medium transition-all ${
                mode === "specific" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Specific
            </button>
          </div>

          {/* Athlete picker — only when specific */}
          {mode === "specific" && (
            <div className="card-surface rounded-2xl border border-border overflow-hidden">
              {athletes.length === 0 ? (
                <p className="text-[12px] text-muted-foreground text-center px-3 py-4">
                  No athletes in this gym yet.
                </p>
              ) : (
                <div className="divide-y divide-border/40 max-h-[35vh] overflow-y-auto">
                  {athletes.map((a) => {
                    const isSel = selected.has(a.user_id);
                    return (
                      <button
                        key={a.user_id}
                        type="button"
                        onClick={() => toggleSelected(a.user_id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 min-h-[48px] active:bg-muted/30 transition-colors text-left"
                      >
                        <AthleteAvatar avatarUrl={a.avatar_url} name={a.display_name} size={32} />
                        <span className="flex-1 text-[13px] font-medium truncate">
                          {a.display_name}
                        </span>
                        <span
                          className={`h-5 w-5 rounded-full border flex items-center justify-center transition-colors ${
                            isSel ? "bg-primary border-primary" : "border-border"
                          }`}
                          aria-hidden
                        >
                          {isSel && <Check className="h-3 w-3 text-primary-foreground" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {selected.size > 0 && (
                <div className="border-t border-border/40 px-3 py-2 text-[11px] text-muted-foreground">
                  {selected.size} selected
                </div>
              )}
            </div>
          )}

          {/* Poll expiry pills */}
          {kind === "poll" && (
            <div className="flex gap-1.5 overflow-x-auto px-1 -mx-1 scrollbar-hide">
              <span className="text-[11px] text-muted-foreground self-center pr-1.5 flex-shrink-0">
                Closes in
              </span>
              {EXPIRY_PRESETS.map((p) => {
                const active = pollExpiresHours === p.hours;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setPollExpiresHours(p.hours)}
                    className={`h-8 px-3 rounded-full text-[11px] font-medium border whitespace-nowrap transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/30 text-muted-foreground border-border/40"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Body / question textarea */}
          <div className="card-surface rounded-2xl border border-border p-3">
            <textarea
              value={body}
              onChange={(e) =>
                setBody(e.target.value.slice(0, kind === "poll" ? POLL_QUESTION_MAX : MAX_BODY))
              }
              placeholder={
                kind === "poll"
                  ? "Ask your fighters…"
                  : kind === "image"
                    ? "Caption (optional)"
                    : "Share a tip, schedule change, or shoutout…"
              }
              rows={kind === "poll" ? 2 : 5}
              className="w-full bg-transparent text-[14px] leading-relaxed resize-none placeholder:text-muted-foreground/60 focus:outline-none"
              autoFocus
            />
            <div className="flex justify-end pt-1">
              <span
                className={`text-[10px] tabular-nums ${
                  remaining < 50 ? "text-amber-500" : "text-muted-foreground/60"
                }`}
              >
                {remaining}
              </span>
            </div>
          </div>

          {/* Image picker tile */}
          {kind === "image" && (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={imageUploading}
                className="w-full rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 min-h-[140px] max-h-[220px] flex items-center justify-center overflow-hidden relative active:bg-primary/10 transition-colors"
              >
                {imageUrl ? (
                  <>
                    <img
                      src={imageUrl}
                      loading="lazy"
                      className="w-full h-full object-cover max-h-[220px] rounded-xl"
                      alt=""
                    />
                    {imageUploading && (
                      <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </span>
                    )}
                  </>
                ) : imageUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-primary py-6">
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">
                      Add image
                    </span>
                  </div>
                )}
              </button>
              {imageUrl && !imageUploading && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="text-[11px] text-muted-foreground underline"
                  >
                    Replace
                  </button>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickFile}
              />
            </>
          )}

          {/* Poll options */}
          {kind === "poll" && (
            <div className="space-y-2">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={opt}
                    maxLength={POLL_OPTION_MAX}
                    placeholder={`Option ${i + 1}`}
                    onChange={(e) => updateOption(i, e.target.value)}
                    className="h-10 rounded-xl bg-muted/30 border-border/40"
                  />
                  <button
                    type="button"
                    disabled={pollOptions.length <= 2}
                    onClick={() => removeOption(i)}
                    className="h-10 w-10 rounded-xl border border-border/40 flex items-center justify-center text-muted-foreground disabled:opacity-30 active:bg-muted/40"
                    aria-label="Remove option"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button
                  type="button"
                  onClick={addOption}
                  className="w-full h-10 rounded-xl border border-dashed border-border/60 text-[12px] font-medium text-muted-foreground active:bg-muted/30 flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" /> Add option
                </button>
              )}
            </div>
          )}
        </div>

        {/* Secondary full-width Send */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="mt-3 w-full h-11 rounded-2xl bg-primary text-primary-foreground text-[14px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 flex items-center justify-center gap-1.5 shrink-0"
        >
          {sending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
          ) : (
            <><Send className="h-3.5 w-3.5" />
              {kind === "poll" ? "Open poll" : kind === "image" ? "Post image" : "Send announcement"}
            </>
          )}
        </button>
      </SheetContent>
    </Sheet>
  );
}
