import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

interface WatermarkConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function WatermarkConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: WatermarkConfirmDialogProps) {
  const [doNotShow, setDoNotShow] = useState(false);
  const updatePref = trpc.auth.updatePreference.useMutation();

  function handleConfirm() {
    if (doNotShow) {
      updatePref.mutate({ skipWatermarkConfirm: true });
    }
    onConfirm();
  }

  function handleCancel() {
    setDoNotShow(false);
    onCancel();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Download Watermarked Preview?</DialogTitle>
          <DialogDescription className="pt-1">
            You are about to download a watermarked preview of this track. The
            preview contains an audio watermark and is intended for review
            purposes only — it is not for final use in any project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2">
          <Checkbox
            id="doNotShow"
            checked={doNotShow}
            onCheckedChange={(checked) => setDoNotShow(checked === true)}
          />
          <Label htmlFor="doNotShow" className="text-sm text-muted-foreground cursor-pointer">
            Do not show this message again
          </Label>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="w-full sm:w-auto"
          >
            No, Return to Browsing
          </Button>
          <Button
            onClick={handleConfirm}
            className="w-full sm:w-auto bg-primary text-primary-foreground"
          >
            Yes, Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
