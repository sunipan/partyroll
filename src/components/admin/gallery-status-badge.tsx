import { Badge } from "@/components/ui/badge";
import type { GalleryStatus } from "@/lib/galleries/rules";
import { cn } from "@/lib/utils";

const statusLabels: Record<GalleryStatus, string> = {
  open: "Open",
  closed: "Closed",
  archived: "Archived",
  deleting: "Deleting",
};

const statusStyles: Record<GalleryStatus, string> = {
  open: "border-primary/15 bg-primary/10 text-primary",
  closed: "border-marigold/30 bg-accent/65 text-accent-foreground",
  archived: "border-border bg-muted/60 text-muted-foreground",
  deleting: "border-destructive/20 bg-destructive/8 text-destructive",
};

export function GalleryStatusBadge({ status }: { status: GalleryStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("h-5 gap-1.5 px-2 text-[0.6875rem]", statusStyles[status])}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {statusLabels[status]}
    </Badge>
  );
}
