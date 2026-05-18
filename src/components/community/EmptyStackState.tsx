/**
 * "Corner's empty" state — shown when the polaroid stack has been
 * exhausted (`topIndex >= posts.length`) OR when the gym genuinely has
 * no posts yet.
 *
 * The faint background Swords icon is intentional: it's the same icon
 * used in the bottom-nav for this tab, so the empty state reads as
 * "you're in the right place, the room is just quiet" rather than an
 * error. A solid-colour empty would look like the feed failed to load.
 *
 * The CTA delegates to the parent — composer ownership lives one level
 * up so the same button can wire into either the global FAB or an
 * inline launcher depending on context.
 */
import { Swords } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStackStateProps {
  onPostClick: () => void;
}

export function EmptyStackState({ onPostClick }: EmptyStackStateProps) {
  return (
    <div className="relative flex flex-col items-center justify-center px-8 py-20 text-center">
      {/* Faint background icon — 64px @ 20% opacity per spec. */}
      <Swords
        className="h-16 w-16 text-foreground opacity-20 mb-6"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className="text-base font-medium text-foreground">
        Corner's empty. Post the first round.
      </p>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-[24ch]">
        Share a session and your gym will see it.
      </p>
      <Button
        type="button"
        onClick={onPostClick}
        className="mt-6 rounded-full px-6"
      >
        Share a session
      </Button>
    </div>
  );
}
