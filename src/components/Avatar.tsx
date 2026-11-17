/** Profile avatar: the profile's initial on its chosen colour (always dark ink text for contrast). */
export function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <span className="avatar" style={{ background: color, width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
