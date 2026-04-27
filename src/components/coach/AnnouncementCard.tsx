import { memo, useRef, useState } from "react";
import { Trash2, Check } from "lucide-react";
import { motion, useMotionValue, useReducedMotion } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { relativeTime, formatCountdown } from "@/lib/relativeTime";
import type { GymAnnouncement } from "@/hooks/coach/useGymAnnouncements";

const DELETE_THRESHOLD = -80;

interface Props {
  a: GymAnnouncement;
  onDismiss: () => void;
  onVote: (optionId: string) => void;
}

function Header({ a }: { a: GymAnnouncement }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-[12px] font-semibold truncate">{a.sender_name}</p>
        <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
          {relativeTime(a.created_at)}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground/80 mb-1.5">
        {a.gym_name}
        {!a.is_broadcast && (
          <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] uppercase tracking-wider font-semibold">
            For you
          </span>
        )}
      </p>
    </>
  );
}

function TextBody({ a }: { a: GymAnnouncement }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = a.body.length > 280;
  return (
    <>
      <p
        className={`text-[13px] text-foreground/90 leading-snug whitespace-pre-wrap break-words ${
          !expanded && isLong ? "line-clamp-6" : ""
        }`}
      >
        {a.body}
      </p>
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-[11px] text-primary mt-1 font-medium"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </>
  );
}

function ImageBody({ a }: { a: GymAnnouncement }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!a.image_url) return null;
  return (
    <>
      {failed ? (
        <div className="w-full h-40 rounded-xl bg-muted/30 flex items-center justify-center">
          <span className="text-[11px] text-muted-foreground/70">Image unavailable</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="block w-full"
        >
          <img
            src={a.image_url}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="w-full max-h-[280px] object-cover rounded-xl"
            alt=""
          />
        </button>
      )}
      {a.body && (
        <p className="text-[13px] text-foreground/90 leading-snug mt-2 whitespace-pre-wrap break-words">
          {a.body}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-screen-md p-0 bg-black border-none"
          onClick={() => setOpen(false)}
        >
          <VisuallyHidden><DialogTitle>Image</DialogTitle></VisuallyHidden>
          {!failed && (
            <img src={a.image_url} className="w-full h-auto max-h-[90vh] object-contain" alt="" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PollBody({ a, onVote }: { a: GymAnnouncement; onVote: (id: string) => void }) {
  if (!a.poll) return null;
  const closed = !!a.expires_at && new Date(a.expires_at) < new Date();
  const total = Math.max(a.poll.total_votes, 1);
  const hasVoted = !!a.poll.my_vote_id;

  return (
    <div>
      <p className="text-[13px] font-medium text-foreground/90 mb-2 whitespace-pre-wrap">
        {a.body}
      </p>
      <div className="space-y-1.5">
        {a.poll.options.map((opt) => {
          const pct = a.poll!.total_votes ? Math.round((opt.vote_count / total) * 100) : 0;
          const mine = a.poll!.my_vote_id === opt.id;
          const disabled = closed;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={(e) => { e.stopPropagation(); if (!disabled) onVote(opt.id); }}
              onPointerDown={(e) => e.stopPropagation()}
              className={`relative w-full text-left rounded-xl border px-3 py-2 overflow-hidden transition ${
                mine ? "border-primary/60" : "border-border/50"
              } ${disabled ? "opacity-80 cursor-default" : "active:scale-[0.99]"}`}
            >
              <div
                className={`absolute inset-y-0 left-0 ${mine ? "bg-primary/30" : "bg-primary/12"}`}
                style={{ width: `${pct}%`, transition: "width 0.4s ease" }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <span className="text-[13px] flex items-center gap-1.5">
                  {mine && <Check className="h-3 w-3 text-primary" />}
                  {opt.text}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/70 mt-1.5 tabular-nums">
        {a.poll.total_votes} {a.poll.total_votes === 1 ? "vote" : "votes"}
        {" · "}
        {closed
          ? "Closed"
          : hasVoted
            ? `closes in ${formatCountdown(a.expires_at)}`
            : a.expires_at
              ? `${formatCountdown(a.expires_at)} left`
              : "tap to vote"}
      </p>
    </div>
  );
}

export const AnnouncementCard = memo(function AnnouncementCard({ a, onDismiss, onVote }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const dragX = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  const crossedRef = useRef(false);
  const canSwipe = !prefersReducedMotion;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {canSwipe && isDragging && (
        <div className="absolute inset-0 flex items-center justify-end bg-destructive/90 rounded-2xl px-5">
          <Trash2 className="h-4 w-4 text-destructive-foreground" />
        </div>
      )}
      <motion.div
        className="relative card-surface rounded-2xl border border-border p-3"
        style={{ x: canSwipe ? dragX : undefined }}
        drag={canSwipe ? "x" : false}
        dragConstraints={{ left: -120, right: 0 }}
        dragElastic={0.1}
        dragSnapToOrigin
        onDragStart={() => { crossedRef.current = false; setIsDragging(true); }}
        onDrag={() => {
          crossedRef.current = dragX.get() < DELETE_THRESHOLD;
        }}
        onDragEnd={() => {
          setIsDragging(false);
          if (dragX.get() < DELETE_THRESHOLD) onDismiss();
        }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
      >
        <Header a={a} />
        {a.kind === "text" && <TextBody a={a} />}
        {a.kind === "image" && <ImageBody a={a} />}
        {a.kind === "poll" && <PollBody a={a} onVote={onVote} />}
      </motion.div>
    </div>
  );
});
