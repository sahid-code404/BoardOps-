export type ResidentStatus = "ACTIVE" | "PENDING" | "SUSPENDED" | "ARCHIVED";

export type ResidentLifecycleAction =
  | "APPROVE"
  | "REQUEST_CHANGES"
  | "REJECT"
  | "SUSPEND"
  | "ACTIVATE"
  | "ARCHIVE"
  | "RESTORE";

const transitions: Record<ResidentStatus, Partial<Record<ResidentLifecycleAction, ResidentStatus>>> = {
  PENDING: {
    APPROVE: "ACTIVE",
    REQUEST_CHANGES: "PENDING",
    REJECT: "ARCHIVED",
  },
  ACTIVE: {
    SUSPEND: "SUSPENDED",
    ARCHIVE: "ARCHIVED",
  },
  SUSPENDED: {
    ACTIVATE: "ACTIVE",
    ARCHIVE: "ARCHIVED",
  },
  ARCHIVED: {
    RESTORE: "ACTIVE",
  },
};

const reasonRequired = new Set<ResidentLifecycleAction>([
  "REQUEST_CHANGES",
  "REJECT",
  "SUSPEND",
  "ARCHIVE",
]);

export function nextResidentStatus(current: ResidentStatus, action: ResidentLifecycleAction): ResidentStatus {
  const next = transitions[current][action];
  if (!next) {
    throw new Error(`Action ${action} is not valid while resident status is ${current}`);
  }
  return next;
}

export function residentActionRequiresReason(action: ResidentLifecycleAction): boolean {
  return reasonRequired.has(action);
}

export function allowedResidentActions(status: ResidentStatus): ResidentLifecycleAction[] {
  return Object.keys(transitions[status]) as ResidentLifecycleAction[];
}
