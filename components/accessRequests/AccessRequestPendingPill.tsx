"use client";

import { Icon, StatusPill, Tooltip } from "@/components/ui/ds";
import { formatAccessRequestPendingTooltip } from "@/lib/accessRequests/loadPendingAccessRequestSummaries";

type AccessRequestPendingPillProps = {
  count: number;
  requesterNames: string[];
};

export function AccessRequestPendingPill({
  count,
  requesterNames,
}: AccessRequestPendingPillProps) {
  if (count <= 0) return null;

  const label = count === 1 ? "1 request" : `${count} requests`;
  const tooltip = formatAccessRequestPendingTooltip(requesterNames);

  return (
    <Tooltip label={tooltip.label} position="bottom">
      <StatusPill
        color="butter"
        appearance="filled"
        prominence="high"
        size="sm"
        labelTypography="body"
        label={label}
        leadingIcon={<Icon name="status-blocked" size={10} />}
      />
    </Tooltip>
  );
}
