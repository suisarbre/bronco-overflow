import { createHash, randomInt } from "node:crypto";

// Crockford base32: no I, L, O, or U, so codes are easy to read aloud and retype.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A grouped random code like ABCD-EFGH-JKMN (3 groups = 60 bits). */
export function newCode(groups = 3): string {
  let code = "";
  for (let i = 0; i < groups * 4; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code.match(/.{4}/g)!.join("-");
}

/** Accepts sloppy input: lower case, missing dashes, O for 0, I or L for 1. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[^0-9A-Z]/g, "");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}
