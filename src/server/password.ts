import "server-only";
import { randomInt } from "node:crypto";

// Look-alike characters (0/O, 1/l/I) are left out so invites are easy to type.
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

const pick = (chars: string) => chars[randomInt(chars.length)];

/** Cryptographically random password that always satisfies passwordSchema. */
export function generateTemporaryPassword(length = 12) {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  // Fisher–Yates shuffle so the guaranteed classes aren't always at the start.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
