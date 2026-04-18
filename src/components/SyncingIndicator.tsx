interface Props {
  active: boolean;
}

export function SyncingIndicator({ active }: Props) {
  if (!active) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70"
      aria-live="polite"
      aria-label="Syncing"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-pulse" />
      Syncing…
    </span>
  );
}
