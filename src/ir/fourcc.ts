/** Existing rawcode conversions shared by script bindings and the simulation. */
export function fourCC(id: number): string {
  const u = id >>> 0;
  return String.fromCharCode((u >>> 24) & 0xff, (u >>> 16) & 0xff, (u >>> 8) & 0xff, u & 0xff);
}

export function rawCodeOf(value: string): number {
  return (((value.charCodeAt(0) || 0) << 24) | ((value.charCodeAt(1) || 0) << 16) | ((value.charCodeAt(2) || 0) << 8) | (value.charCodeAt(3) || 0)) >>> 0;
}

