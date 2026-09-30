import type { PlannerData } from './types';
/** Keep the most recent active data when switching, including unsaved edits. */
export function updatePlanLibrary(plans: PlannerData[], current: PlannerData, next?: PlannerData) {
  const byId = new Map(plans.map(plan => [plan.trip.id, plan]));
  byId.set(current.trip.id, current);
  if (next && next.trip.id !== current.trip.id) byId.set(next.trip.id, next);
  return [...byId.values()];
}
