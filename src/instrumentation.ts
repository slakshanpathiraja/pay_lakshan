// Runs once when the server starts: create tables and seed the admin eagerly.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.TURSO_DATABASE_URL)
    return;
  const { ensureDb } = await import("./server/db/init");
  await ensureDb().catch((err) =>
    console.error("[db] init failed:", err.message),
  );
}
