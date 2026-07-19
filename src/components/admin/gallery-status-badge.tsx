import { Badge } from "@/components/ui/badge";
import type { GalleryStatus } from "@/lib/galleries/rules";

const statusLabels: Record<GalleryStatus, string> = {
  open: "Open",
  closed: "Closed",
  archived: "Archived",
  deleting: "Deleting",
};

export function GalleryStatusBadge({ status }: { status: GalleryStatus }) {
  return (
    <Badge variant={status === "open" ? "default" : "outline"}>
      {statusLabels[status]}
    </Badge>
  );
}
