import type { CurrentTelegramRole } from "./authorization-service.js";
import type { PlanningAccessPolicyValue } from "../chat/types.js";

export type PlanningAccessInput = Readonly<{
  currentRole: CurrentTelegramRole;
  policy: PlanningAccessPolicyValue | null | undefined;
  wasPreviousParticipant: boolean;
}>;

function isCurrentMember(role: CurrentTelegramRole) {
  return (
    role === "creator" ||
    role === "administrator" ||
    role === "member" ||
    role === "restricted"
  );
}

/** Evaluates the configured broadening policy without ever excluding current admins. */
export function canStartPlanning({
  currentRole,
  policy,
  wasPreviousParticipant,
}: PlanningAccessInput): boolean {
  if (currentRole === "creator" || currentRole === "administrator") return true;
  if (!isCurrentMember(currentRole)) return false;
  switch (policy) {
    case "ADMINS_ONLY":
      return false;
    case "PREVIOUS_PARTICIPANTS":
      return wasPreviousParticipant;
    case "ANYONE_IN_CHAT":
      return true;
    default:
      return false;
  }
}

export class PlanningAccessService {
  canStartPlanning(input: PlanningAccessInput) {
    return canStartPlanning(input);
  }
}
