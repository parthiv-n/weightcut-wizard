import { useState } from "react";

interface Props {
  avatarUrl: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}

/**
 * Circular athlete avatar — uses profile.avatar_url when present, falls back
 * to a muted single-letter circle. Mirrors GymLogoAvatar but rounded-full.
 */
export function AthleteAvatar({ avatarUrl, name, size = 36, className = "" }: Props) {
  const [errored, setErrored] = useState(false);
  const dimension = { width: size, height: size };
  const showImage = avatarUrl && !errored;
  const initial = (name?.trim()?.[0] || "A").toUpperCase();

  if (showImage) {
    return (
      <img
        key={avatarUrl}
        src={avatarUrl as string}
        alt={`${name}`}
        style={dimension}
        className={`rounded-full object-cover bg-muted/40 flex-shrink-0 ${className}`}
        onError={() => setErrored(true)}
        loading="lazy"
      />
    );
  }

  return (
    <div
      style={dimension}
      className={`rounded-full bg-muted/60 flex items-center justify-center flex-shrink-0 ${className}`}
      aria-label={name}
    >
      <span className="text-[12px] font-semibold text-muted-foreground">{initial}</span>
    </div>
  );
}
