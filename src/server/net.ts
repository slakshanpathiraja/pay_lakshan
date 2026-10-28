import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Outgoing connections to addresses managers type in (app webhook URLs, SMTP hosts) must not
// reach the server's own private network (SSRF). Local development may use them.

function isPrivate(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivate(v.slice(7)); // IPv4-mapped
    return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
  );
}

/** Throws when `host` is, or resolves to, a private / loopback / link-local address (production only). */
export async function assertPublicHost(host: string) {
  if (process.env.NODE_ENV !== "production") return;
  const name = host.replace(/^\[|\]$/g, "");
  const addresses = isIP(name) ? [name] : (await lookup(name, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivate)) throw new Error("private network address not allowed");
}
