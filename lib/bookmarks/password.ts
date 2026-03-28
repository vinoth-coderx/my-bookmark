function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const normalized = storedHash.trim().toLowerCase();
  const expected = normalized.startsWith("sha256:") ? normalized.slice("sha256:".length) : normalized;
  if (!expected) return false;

  const actual = (await sha256Hex(password)).toLowerCase();
  return actual === expected;
}

