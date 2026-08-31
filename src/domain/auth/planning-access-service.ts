import type { CurrentTelegramRole } from "./authorization-service.js";
import type { PlanningAccessPolicyValue } from "../chat/types.js";

export type PlanningAccessInput = Readonly<{
  currentRole: CurrentTelegramRole;
  policy: PlanningAccessPolicyValue | null | undefined;
  wasPreviousParticipant: boolean;
}>;

/**
 * Whether the role is one a user currently present in the chat can hold.
 *
 * Exported so the callback boundary can ask the same question with the same
 * answer: a second copy of this predicate is a second place for the membership
 * rule to drift, and the two would disagree silently.
 */
export function isCurrentMember(role: CurrentTelegramRole) {
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
