import { updateGalleryStatusAction } from "@/app/admin/galleries/actions";
import { Button } from "@/components/ui/button";
import {
  getAllowedGalleryTransitions,
  type GalleryStatus,
} from "@/lib/galleries/rules";

const transitionLabels: Record<GalleryStatus, string> = {
  open: "Open gallery",
  closed: "Close gallery",
  archived: "Archive gallery",
  deleting: "Deleting gallery",
};

const transitionDescriptions: Record<GalleryStatus, string> = {
  open: "Allow guests to view and upload once guest access is enabled.",
  closed: "Keep viewing available but stop new uploads once guest access is enabled.",
  archived: "Disable all guest access without deleting the gallery.",
  deleting: "Deletion is in progress. Guest access and uploads stay disabled.",
};

export function GalleryStatusControls({
  galleryId,
  status,
}: {
  galleryId: string;
  status: GalleryStatus;
}) {
  const transitions = getAllowedGalleryTransitions(status);

  if (transitions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-destructive/20 bg-destructive/5 p-3 text-sm leading-5 text-muted-foreground">
        Status changes are unavailable while gallery deletion is in progress.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {transitions.map((nextStatus) => (
        <form
          action={updateGalleryStatusAction}
          key={nextStatus}
          className="flex min-w-0 flex-col gap-3 rounded-xl border border-primary/10 bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between md:flex-col md:items-stretch lg:flex-row lg:items-center"
        >
          <input type="hidden" name="galleryId" value={galleryId} />
          <input type="hidden" name="nextStatus" value={nextStatus} />
          <div>
            <p className="font-medium">{transitionLabels[nextStatus]}</p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {transitionDescriptions[nextStatus]}
            </p>
          </div>
          <Button
            type="submit"
            variant={nextStatus === "archived" ? "outline" : "default"}
            size="sm"
            className="w-full shrink-0 sm:w-auto md:w-full lg:w-auto"
          >
            {transitionLabels[nextStatus]}
          </Button>
        </form>
      ))}
    </div>
  );
}
