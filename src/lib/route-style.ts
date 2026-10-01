/** A solid route with a white casing remains distinct from yellow/orange map roads. */
export function routeLineStyle(active = false) {
  return { width: active ? 6 : 5, casingWidth: active ? 10 : 9, opacity: active ? 1 : 0.94, outlineColor: '#ffffff', zIndex: active ? 70 : 60 };
}
