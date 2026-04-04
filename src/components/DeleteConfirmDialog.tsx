import { useEffect } from "react";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { triggerHapticWarning } from "@/lib/haptics";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  itemName?: string;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Delete Entry",
  description,
  itemName,
}: DeleteConfirmDialogProps) {
  const defaultDescription = itemName
    ? `Are you sure you want to delete "${itemName}"?`
    : "Are you sure you want to delete this entry?";

  useEffect(() => {
    if (open) triggerHapticWarning();
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-center items-center">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/20">
            <Trash2 className="h-6 w-6 text-destructive" />
          </div>
          <AlertDialogTitle className="text-center text-lg">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-center text-[13px] leading-relaxed">
            {description || defaultDescription}
            <span className="block mt-2 text-xs text-muted-foreground/50">
              This action cannot be undone.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-3 pt-2">
          <AlertDialogCancel className="flex-1 h-12 rounded-2xl text-[15px] font-semibold">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="flex-1 h-12 rounded-2xl text-[15px] font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
