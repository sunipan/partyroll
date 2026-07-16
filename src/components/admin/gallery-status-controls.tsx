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
};

const transitionDescriptions: Record<GalleryStatus, string> = {
  open: "Allow guests to view and upload once guest access is enabled.",
  closed: "Keep viewing available but stop new uploads once guest access is enabled.",
  archived: "Disable all guest access without deleting the gallery.",
};

export function GalleryStatusControls({
  galleryId,
  status,
}: {
  galleryId: string;
  status: GalleryStatus;
}) {
  const transitions = getAllowedGalleryTransitions(status);

  return (
    <div className="space-y-3">
      {transitions.map((nextStatus) => (
        <form
          action={updateGalleryStatusAction}
          key={nextStatus}
          className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <input type="hidden" name="galleryId" value={galleryId} />
          <input type="hidden" name="nextStatus" value={nextStatus} />
          <div>
            <p className="font-medium">{transitionLabels[nextStatus]}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {transitionDescriptions[nextStatus]}
            </p>
          </div>
          <Button
            type="submit"
            variant={nextStatus === "archived" ? "outline" : "default"}
            className="shrink-0"
          >
            {transitionLabels[nextStatus]}
          </Button>
        </form>
      ))}
    </div>
  );
}
