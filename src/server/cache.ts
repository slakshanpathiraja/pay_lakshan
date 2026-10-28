import "server-only";
import { randomBytes } from "node:crypto";
import { query } from "./db/pool";

// In-memory caches for one server instance that stay right across instances. Two version
// stamps live in app_meta:
//   version:data    changes after every write (any API request that isn't a GET)
//   version:access  changes when roles, permission cards, platforms or managers change
// An instance reads them at most every VERSION_CHECK_MS (one small query) and treats
// anything cached under an older stamp as gone — so a change made on one instance shows on
// the others within a few seconds, while repeated reads skip the database.

const VERSION_CHECK_MS = 5_000;
const MAX_ENTRIES = 5_000;

type VersionName = "data" | "access";
interface Entry {
  value: unknown;
  expires: number;
  version: string;
}

const g = globalThis as unknown as {
  payCache?: {
    versions: Record<VersionName, string>;
    checkedAt: number;
    entries: Map<string, Entry>;
    accessChanged: boolean;
  };
};
const state = (g.payCache ??= {
  versions: { data: "", access: "" },
  checkedAt: 0,
  entries: new Map(),
  accessChanged: false,
});

async function versions() {
  if (Date.now() - state.checkedAt < VERSION_CHECK_MS) return state.versions;
  const { rows } = await query<{ key: string; value: string }>(
    "SELECT key, value FROM app_meta WHERE key IN ('version:data', 'version:access')",
  );
  const read = (name: VersionName) => rows.find((r) => r.key === `version:${name}`)?.value ?? "0";
  state.versions = { data: read("data"), access: read("access") };
  state.checkedAt = Date.now();
  return state.versions;
}

/**
 * `load()`'s result, cached under `key` for `ttlMs` — or until `dependsOn`'s version changes
 * (anywhere: checked every few seconds). `keep` can refuse to cache a result.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  dependsOn: VersionName,
  load: () => Promise<T>,
  keep: (value: T) => boolean = () => true,
): Promise<T> {
  const version = (await versions())[dependsOn];
  const hit = state.entries.get(key);
  if (hit && hit.expires > Date.now() && hit.version === version) return hit.value as T;
  const value = await load();
  if (!keep(value)) return value;
  if (state.entries.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, e] of state.entries) if (e.expires <= now) state.entries.delete(k);
    if (state.entries.size >= MAX_ENTRIES) state.entries.clear();
  }
  state.entries.set(key, { value, expires: Date.now() + ttlMs, version });
  return value;
}

/** Roles, permission cards, platforms or managers changed: cached access is stale too. */
export function markAccessChanged() {
  state.accessChanged = true;
}

/** After a write: new version stamps, so every instance drops what it cached. */
export async function bumpVersions() {
  const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
  const names: VersionName[] = state.accessChanged ? ["data", "access"] : ["data"];
  state.accessChanged = false;
  await query(
    `INSERT INTO app_meta (key, value) VALUES ${names.map((_, i) => `($${i + 1}, $${names.length + 1})`).join(", ")}
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [...names.map((n) => `version:${n}`), stamp],
  );
  for (const n of names) state.versions[n] = stamp;
}
