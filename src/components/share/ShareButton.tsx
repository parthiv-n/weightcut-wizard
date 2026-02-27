import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  onClick: () => void;
  className?: string;
}

export function ShareButton({ onClick, className }: ShareButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={`rounded-full h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/50 ${className ?? ""}`}
    >
      <Share2 className="h-4 w-4" />
    </Button>
  );
}
