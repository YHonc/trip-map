import { COLORS } from './data';
import type { PlannerData } from './types';

export function importedDayColor(index: number): string {
  if (index < COLORS.length) return COLORS[index];
  // Avoid the yellow/orange hues used by road basemaps, including for long trips.
  const hue = 150 + ((index - COLORS.length) * 137.508 + 25) % 200;
  const saturation = (66 + index % 3 * 8) / 100, lightness = (33 + Math.floor(index / 3) % 3 * 5) / 100;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
/** Apply only at import, never during ordinary validation or saving. */
export function colorImportedDays(data: PlannerData): PlannerData {
  return { ...data, trip: { ...data.trip, days: data.trip.days.map((day, index) => {
    const color = importedDayColor(index);
    return { ...day, color, routes: day.routes.map(route => ({ ...route, color })) };
  }) } };
}
