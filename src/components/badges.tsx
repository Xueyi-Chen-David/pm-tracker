import type {
  Health,
  Priority,
  ProjectStatus,
  ProjectType,
  MilestoneStatus,
} from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  HEALTH,
  PRIORITY,
  PROJECT_STATUS,
  PROJECT_TYPE,
  MILESTONE_STATUS,
} from "@/lib/constants";

function Pill({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function HealthDot({
  health,
  className,
}: {
  health: Health;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        HEALTH[health].dot,
        className,
      )}
      title={HEALTH[health].label}
    />
  );
}

export function HealthBadge({ health }: { health: Health }) {
  return (
    <Pill className={HEALTH[health].badge}>
      <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH[health].dot)} />
      {HEALTH[health].label}
    </Pill>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <Pill className={PROJECT_STATUS[status].badge}>{PROJECT_STATUS[status].label}</Pill>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Pill className={PRIORITY[priority].badge}>{PRIORITY[priority].label}</Pill>;
}

export function TypeBadge({ type }: { type: ProjectType }) {
  return <Pill className={PROJECT_TYPE[type].badge}>{PROJECT_TYPE[type].label}</Pill>;
}

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  return (
    <Pill className={MILESTONE_STATUS[status].badge}>
      {MILESTONE_STATUS[status].label}
    </Pill>
  );
}
