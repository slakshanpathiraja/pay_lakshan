import "server-only";

// The database schema (SQLite / Turso). Applied by ensureDb (init.ts) — every statement is
// "IF NOT EXISTS", so running it again changes nothing. Change a table here → also add the
// ALTER for existing databases in init.ts and bump SCHEMA_VERSION.
//
// Conventions: ids are INTEGER PRIMARY KEY AUTOINCREMENT (platforms: a UUID as text, made by
// the app); times are ISO-8601 UTC text (see pool.ts); booleans 0/1; JSON as text; money in
// minor units (cents).

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";
const TS = `TEXT NOT NULL DEFAULT ${NOW}`;

export const TABLES: string[] = [
  // --- Platforms (tenants), roles, accounts, memberships --------------------------------
  `CREATE TABLE IF NOT EXISTS platforms (
    id          TEXT     PRIMARY KEY,
    name        TEXT     NOT NULL,
    is_active   INTEGER  NOT NULL DEFAULT 1,
    is_test     INTEGER  NOT NULL DEFAULT 0,
    created_at  ${TS},
    updated_at  ${TS}
  )`,
  // Every role belongs to a platform, except the global Super Admin role (platform null).
  `CREATE TABLE IF NOT EXISTS roles (
    id           INTEGER  PRIMARY KEY AUTOINCREMENT,
    platform_id  TEXT     REFERENCES platforms(id) ON DELETE CASCADE,
    key          TEXT,
    name         TEXT     NOT NULL,
    is_system    INTEGER  NOT NULL DEFAULT 0,
    is_active    INTEGER  NOT NULL DEFAULT 1,
    created_at   ${TS},
    updated_at   ${TS},
    UNIQUE (id, platform_id)
  )`,
  // users.role_id: only for super admins; everyone else's role is per platform (user_platforms)
  `CREATE TABLE IF NOT EXISTS users (
    id                    INTEGER  PRIMARY KEY AUTOINCREMENT,
    username              TEXT     NOT NULL UNIQUE,
    full_name             TEXT,
    email                 TEXT,
    password_hash         TEXT     NOT NULL,
    role_id               INTEGER  REFERENCES roles(id) ON DELETE RESTRICT,
    last_platform_id      TEXT     REFERENCES platforms(id) ON DELETE SET NULL,
    must_change_password  INTEGER  NOT NULL DEFAULT 1,
    is_active             INTEGER  NOT NULL DEFAULT 1,
    token_version         INTEGER  NOT NULL DEFAULT 0,
    last_login_at         TEXT,
    created_at            ${TS},
    updated_at            ${TS}
  )`,
  // A user's role on each platform; the (role, platform) key keeps it one of that platform's.
  `CREATE TABLE IF NOT EXISTS user_platforms (
    user_id      INTEGER  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform_id  TEXT     NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    role_id      INTEGER  NOT NULL,
    created_at   ${TS},
    PRIMARY KEY (user_id, platform_id),
    FOREIGN KEY (role_id, platform_id) REFERENCES roles(id, platform_id)
  )`,

  // --- Permission cards (global) and the access matrix -------------------------------------
  `CREATE TABLE IF NOT EXISTS permissions (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    key         TEXT     NOT NULL,
    name        TEXT     NOT NULL,
    parent_id   INTEGER  REFERENCES permissions(id) ON DELETE SET NULL,
    created_at  ${TS},
    updated_at  ${TS}
  )`,
  // The URLs a card grants: pages (kind 'page') and API endpoints (kind 'api', with a method)
  `CREATE TABLE IF NOT EXISTS permission_urls (
    id             INTEGER  PRIMARY KEY AUTOINCREMENT,
    permission_id  INTEGER  NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    kind           TEXT     NOT NULL CHECK (kind IN ('page', 'api')),
    method         TEXT     CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
    path           TEXT     NOT NULL,
    CHECK ((kind = 'api') = (method IS NOT NULL))
  )`,
  // The four actions (levels) a URL can be used for; their order is defined in code (ACTIONS)
  `CREATE TABLE IF NOT EXISTS actions (key TEXT PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS permission_url_actions (
    permission_url_id  INTEGER  NOT NULL REFERENCES permission_urls(id) ON DELETE CASCADE,
    action             TEXT     NOT NULL REFERENCES actions(key),
    PRIMARY KEY (permission_url_id, action)
  )`,
  `CREATE TABLE IF NOT EXISTS role_permission_actions (
    role_id        INTEGER  NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id  INTEGER  NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    action         TEXT     NOT NULL REFERENCES actions(key),
    PRIMARY KEY (role_id, permission_id, action)
  )`,

  // --- Misc ---------------------------------------------------------------------------------
  // One-off markers and settings, e.g. "first-run data was seeded", the schema version
  `CREATE TABLE IF NOT EXISTS app_meta (
    key         TEXT  PRIMARY KEY,
    value       TEXT,
    updated_at  ${TS}
  )`,
  `CREATE TABLE IF NOT EXISTS smtp_servers (
    id            INTEGER  PRIMARY KEY AUTOINCREMENT,
    platform_id   TEXT     NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    name          TEXT     NOT NULL,
    host          TEXT     NOT NULL,
    port          INTEGER  NOT NULL CHECK (port BETWEEN 1 AND 65535),
    secure        INTEGER  NOT NULL DEFAULT 0,
    username      TEXT,
    password_enc  TEXT,
    from_email    TEXT     NOT NULL,
    from_name     TEXT,
    reply_to      TEXT,
    is_default    INTEGER  NOT NULL DEFAULT 0,
    is_active     INTEGER  NOT NULL DEFAULT 1,
    created_at    ${TS},
    updated_at    ${TS}
  )`,
  // Sign-in attempt counters (rate-limit.ts), shared by every server instance
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key       TEXT     PRIMARY KEY,
    count     INTEGER  NOT NULL,
    reset_at  TEXT     NOT NULL
  )`,

  // --- Apps: a platform's websites (by domain) and mobile apps (by app id) -----------------
  `CREATE TABLE IF NOT EXISTS apps (
    id                   INTEGER  PRIMARY KEY AUTOINCREMENT,
    platform_id          TEXT     NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    name                 TEXT     NOT NULL,
    kind                 TEXT     NOT NULL CHECK (kind IN ('domain', 'app_id')),
    identifier           TEXT     NOT NULL,
    app_key              TEXT     NOT NULL UNIQUE,
    app_secret           TEXT     NOT NULL,
    -- App API orders with the app's own item / price (no template): off unless turned on
    allow_custom_orders  INTEGER  NOT NULL DEFAULT 0,
    -- Sign in with Google: the OAuth client ids its ID tokens must be issued for (JSON array)
    google_client_ids    TEXT     NOT NULL DEFAULT '[]',
    created_at           ${TS},
    updated_at           ${TS}
  )`,
  `CREATE TABLE IF NOT EXISTS app_webhooks (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    app_id      INTEGER  NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    url         TEXT     NOT NULL,
    created_at  ${TS},
    UNIQUE (app_id, url)
  )`,
  `CREATE TABLE IF NOT EXISTS app_redirects (
    app_id  INTEGER  NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    status  TEXT     NOT NULL CHECK (status IN ('success', 'failed', 'cancelled', 'pending')),
    url     TEXT     NOT NULL,
    PRIMARY KEY (app_id, status)
  )`,

  // --- An app's customers and what they buy ---------------------------------------------------
  // Every row carries platform_id + app_id, and composite foreign keys keep them consistent.
  //   app_users ─┬─ devices
  //              └─ orders ── order_items, payments
  // billing: lifetime (no interval) / fixed_term (access for N units) / recurring (renews every
  // N units). payment_status pending / paid / failed / refunded; order_status pending / active
  // / expired / cancelled (active needs paid). ends_at NULL = lifetime.
  `CREATE TABLE IF NOT EXISTS app_users (
    id                  INTEGER  PRIMARY KEY AUTOINCREMENT,
    platform_id         TEXT     NOT NULL,
    app_id              INTEGER  NOT NULL,
    name                TEXT     NOT NULL,
    email               TEXT,
    phone               TEXT     CHECK (phone IS NULL OR (phone GLOB '+[1-9]*' AND length(phone) BETWEEN 8 AND 16
                                   AND substr(phone, 2) NOT GLOB '*[^0-9]*')),
    phone_country       TEXT,
    password_hash       TEXT,
    google_sub          TEXT,
    max_devices         INTEGER  NOT NULL DEFAULT 1 CHECK (max_devices BETWEEN 1 AND 1000),
    max_pending_orders  INTEGER  NOT NULL DEFAULT 3 CHECK (max_pending_orders BETWEEN 1 AND 100),
    is_active           INTEGER  NOT NULL DEFAULT 1,
    created_at          ${TS},
    updated_at          ${TS},
    CHECK ((phone IS NULL) = (phone_country IS NULL)),
    CHECK (email IS NOT NULL OR phone IS NOT NULL),
    UNIQUE (id, app_id),
    FOREIGN KEY (app_id, platform_id) REFERENCES apps(id, platform_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS app_user_tokens (
    id            INTEGER  PRIMARY KEY AUTOINCREMENT,
    app_user_id   INTEGER  NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    app_id        INTEGER  NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    token_hash    TEXT     NOT NULL UNIQUE,  -- SHA-256 of the refresh token
    expires_at    TEXT     NOT NULL,
    revoked_at    TEXT,
    last_used_at  TEXT,
    created_at    ${TS}
  )`,
  // A device of a user that is deleted keeps existing without a user (trigger below)
  `CREATE TABLE IF NOT EXISTS devices (
    id           INTEGER  PRIMARY KEY AUTOINCREMENT,
    platform_id  TEXT     NOT NULL,
    app_id       INTEGER  NOT NULL,
    app_user_id  INTEGER,
    device_uid   TEXT     NOT NULL,
    os           TEXT     NOT NULL CHECK (os IN ('android', 'ios', 'web', 'windows', 'macos', 'linux', 'other')),
    model        TEXT,
    fingerprint  TEXT,
    is_active    INTEGER  NOT NULL DEFAULT 1,
    last_seen_at TEXT,
    app_version  TEXT,
    created_at   ${TS},
    updated_at   ${TS},
    UNIQUE (app_id, device_uid),
    FOREIGN KEY (app_id, platform_id) REFERENCES apps(id, platform_id) ON DELETE CASCADE,
    FOREIGN KEY (app_user_id, app_id) REFERENCES app_users(id, app_id)
  )`,
  `CREATE TABLE IF NOT EXISTS order_templates (
    id                 INTEGER  PRIMARY KEY AUTOINCREMENT,
    platform_id        TEXT     NOT NULL,
    app_id             INTEGER  NOT NULL,
    code               TEXT     NOT NULL,
    name               TEXT     NOT NULL,
    currency           TEXT     NOT NULL,
    unit_amount        INTEGER  NOT NULL CHECK (unit_amount >= 0),
    billing            TEXT     NOT NULL CHECK (billing IN ('lifetime', 'fixed_term', 'recurring')),
    interval_unit      TEXT     CHECK (interval_unit IN ('day', 'week', 'month', 'year')),
    interval_count     INTEGER  CHECK (interval_count BETWEEN 1 AND 365),
    google_product_id  TEXT,
    is_active          INTEGER  NOT NULL DEFAULT 1,
    created_at         ${TS},
    updated_at         ${TS},
    CHECK ((billing = 'lifetime') = (interval_unit IS NULL AND interval_count IS NULL)),
    CHECK ((interval_unit IS NULL) = (interval_count IS NULL)),
    UNIQUE (app_id, code),
    FOREIGN KEY (app_id, platform_id) REFERENCES apps(id, platform_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id                      INTEGER  PRIMARY KEY AUTOINCREMENT,
    platform_id             TEXT     NOT NULL,
    app_id                  INTEGER  NOT NULL,
    app_user_id             INTEGER  NOT NULL,
    order_number            TEXT     NOT NULL UNIQUE,
    payment_status          TEXT     NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    order_status            TEXT     NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'active', 'expired', 'cancelled')),
    currency                TEXT     NOT NULL,
    billing                 TEXT     NOT NULL CHECK (billing IN ('lifetime', 'fixed_term', 'recurring')),
    interval_unit           TEXT     CHECK (interval_unit IN ('day', 'week', 'month', 'year')),
    interval_count          INTEGER  CHECK (interval_count BETWEEN 1 AND 365),
    starts_at               TEXT,
    ends_at                 TEXT,
    note                    TEXT,
    paid_at                 TEXT,
    template_id             INTEGER  REFERENCES order_templates(id) ON DELETE SET NULL,
    checkout_session_id     TEXT,
    pay_url                 TEXT,
    pay_url_expires_at      TEXT,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    google_purchase_token   TEXT,
    google_product_id       TEXT,
    created_at              ${TS},
    updated_at              ${TS},
    CHECK ((billing = 'lifetime') = (interval_unit IS NULL AND interval_count IS NULL)),
    CHECK ((interval_unit IS NULL) = (interval_count IS NULL)),
    CHECK (ends_at IS NULL OR ends_at >= starts_at),
    CHECK (order_status <> 'active' OR paid_at IS NOT NULL),
    FOREIGN KEY (app_id, platform_id) REFERENCES apps(id, platform_id) ON DELETE CASCADE,
    FOREIGN KEY (app_user_id, app_id) REFERENCES app_users(id, app_id)
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id           INTEGER  PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER  NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    name         TEXT     NOT NULL,
    quantity     INTEGER  NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 1000),
    unit_amount  INTEGER  NOT NULL CHECK (unit_amount >= 0)
  )`,
  // One row per charge: Stripe (payment intent / invoice) or Google Play (GPA order id)
  `CREATE TABLE IF NOT EXISTS payments (
    id               INTEGER  PRIMARY KEY AUTOINCREMENT,
    platform_id      TEXT     NOT NULL,
    app_id           INTEGER  NOT NULL,
    order_id         INTEGER  NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider         TEXT     NOT NULL DEFAULT 'stripe',
    reference        TEXT     NOT NULL,
    kind             TEXT     NOT NULL CHECK (kind IN ('checkout', 'renewal')),
    invoice_id       TEXT,
    status           TEXT     NOT NULL CHECK (status IN ('processing', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
    amount           INTEGER  NOT NULL CHECK (amount >= 0),
    amount_refunded  INTEGER  NOT NULL DEFAULT 0 CHECK (amount_refunded >= 0),
    currency         TEXT     NOT NULL,
    method_type      TEXT,
    method_details   TEXT,  -- JSON
    receipt_url      TEXT,
    failure_message  TEXT,
    livemode         INTEGER  NOT NULL DEFAULT 0,
    paid_at          TEXT,
    created_at       ${TS},
    updated_at       ${TS},
    UNIQUE (provider, reference),
    FOREIGN KEY (app_id, platform_id) REFERENCES apps(id, platform_id) ON DELETE CASCADE
  )`,
  // Stripe event ids already handled (Stripe can deliver one twice)
  `CREATE TABLE IF NOT EXISTS stripe_events (
    id           TEXT  PRIMARY KEY,
    type         TEXT  NOT NULL,
    received_at  ${TS}
  )`,

  // --- Queues: emails to app users, and app webhook deliveries ----------------------------
  `CREATE TABLE IF NOT EXISTS email_outbox (
    id               INTEGER  PRIMARY KEY AUTOINCREMENT,
    platform_id      TEXT     NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
    template         TEXT     NOT NULL,
    to_email         TEXT     NOT NULL,
    data             TEXT     NOT NULL DEFAULT '{}',  -- JSON
    dedupe_key       TEXT,
    status           TEXT     NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
    attempts         INTEGER  NOT NULL DEFAULT 0,
    next_attempt_at  ${TS},
    last_error       TEXT,
    smtp_server_id   INTEGER,
    created_at       ${TS},
    sent_at          TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS webhook_outbox (
    id               INTEGER  PRIMARY KEY AUTOINCREMENT,
    app_id           INTEGER  NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    url              TEXT     NOT NULL,
    event            TEXT     NOT NULL,
    order_id         INTEGER  NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    data             TEXT     NOT NULL DEFAULT '{}',  -- JSON
    dedupe_key       TEXT,
    status           TEXT     NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
    attempts         INTEGER  NOT NULL DEFAULT 0,
    next_attempt_at  ${TS},
    last_error       TEXT,
    response_status  INTEGER,
    created_at       ${TS},
    sent_at          TEXT
  )`,
];

export const INDEXES: string[] = [
  `CREATE UNIQUE INDEX IF NOT EXISTS platforms_name_lower_idx ON platforms (lower(name))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS roles_platform_name_idx ON roles (COALESCE(platform_id, ''), lower(name))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS roles_platform_key_idx ON roles (COALESCE(platform_id, ''), key) WHERE key IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email))`,
  `CREATE INDEX IF NOT EXISTS users_role_id_idx ON users (role_id)`,
  `CREATE INDEX IF NOT EXISTS user_platforms_platform_idx ON user_platforms (platform_id)`,
  `CREATE INDEX IF NOT EXISTS user_platforms_role_idx ON user_platforms (role_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS permissions_name_lower_idx ON permissions (lower(name))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS permissions_key_idx ON permissions (key)`,
  `CREATE INDEX IF NOT EXISTS permissions_parent_idx ON permissions (parent_id)`,
  `CREATE INDEX IF NOT EXISTS permission_urls_permission_idx ON permission_urls (permission_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS permission_urls_unique ON permission_urls (permission_id, kind, COALESCE(method, ''), path)`,
  `CREATE INDEX IF NOT EXISTS role_permission_actions_permission_idx ON role_permission_actions (permission_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS smtp_servers_platform_default ON smtp_servers (platform_id) WHERE is_default`,
  `CREATE UNIQUE INDEX IF NOT EXISTS apps_identifier_idx ON apps (kind, lower(identifier))`,
  `CREATE INDEX IF NOT EXISTS apps_platform_idx ON apps (platform_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS apps_id_platform_idx ON apps (id, platform_id)`,
  `CREATE INDEX IF NOT EXISTS app_users_platform_idx ON app_users (platform_id, app_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_idx ON app_users (app_id, lower(email)) WHERE email IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS app_users_google_sub_key ON app_users (app_id, google_sub) WHERE google_sub IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS app_user_tokens_user_idx ON app_user_tokens (app_user_id)`,
  `CREATE INDEX IF NOT EXISTS devices_platform_idx ON devices (platform_id, app_id)`,
  `CREATE INDEX IF NOT EXISTS devices_user_idx ON devices (app_user_id)`,
  `CREATE INDEX IF NOT EXISTS devices_fingerprint_idx ON devices (app_id, fingerprint) WHERE fingerprint IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS order_templates_platform_idx ON order_templates (platform_id, app_id)`,
  `CREATE INDEX IF NOT EXISTS orders_platform_idx ON orders (platform_id, app_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (app_user_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_subscription_idx ON orders (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS orders_checkout_session_idx ON orders (checkout_session_id) WHERE checkout_session_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_google_token_idx ON orders (google_purchase_token) WHERE google_purchase_token IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id)`,
  `CREATE INDEX IF NOT EXISTS payments_platform_idx ON payments (platform_id, app_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS payments_order_idx ON payments (order_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_dedupe_idx ON email_outbox (dedupe_key) WHERE dedupe_key IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS email_outbox_due_idx ON email_outbox (next_attempt_at) WHERE status IN ('pending', 'sending')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS webhook_outbox_dedupe_idx ON webhook_outbox (dedupe_key) WHERE dedupe_key IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS webhook_outbox_due_idx ON webhook_outbox (next_attempt_at) WHERE status IN ('pending', 'sending')`,
];

// Emails and app webhooks are queued by triggers, in the same transaction as the change, so
// every way an order or device changes (dashboard, App API, Stripe, Google Play, expiry) is
// covered. While one is still waiting to be sent, another change to the same order doesn't
// queue a second: the message is built from the order as it is when sent.
const pendingEmail = (template: string) =>
  `NOT EXISTS (SELECT 1 FROM email_outbox q WHERE q.template = '${template}' AND q.status = 'pending'
                 AND json_extract(q.data, '$.orderId') = NEW.id)`;
const renewed = `NEW.payment_status = OLD.payment_status AND NEW.order_status = OLD.order_status
    AND NEW.order_status = 'active' AND NEW.payment_status = 'paid'
    AND OLD.ends_at IS NOT NULL AND NEW.ends_at > OLD.ends_at`;
const statusChanged = `NEW.payment_status <> OLD.payment_status OR NEW.order_status <> OLD.order_status`;
const deviceEmail = (template: string, row: "NEW" | "OLD") =>
  `INSERT INTO email_outbox (platform_id, template, to_email, data)
   SELECT ${row}.platform_id, '${template}', u.email,
          json_object('appUserId', ${row}.app_user_id, 'appId', ${row}.app_id,
                      'deviceUid', ${row}.device_uid, 'os', ${row}.os, 'model', ${row}.model)
     FROM app_users u WHERE u.id = ${row}.app_user_id AND u.email IS NOT NULL;`;
const webhooks = (event: string, data: string) =>
  `INSERT INTO webhook_outbox (app_id, url, event, order_id, data)
   SELECT NEW.app_id, w.url, '${event}', NEW.id, ${data}
     FROM app_webhooks w
    WHERE w.app_id = NEW.app_id
      AND NOT EXISTS (SELECT 1 FROM webhook_outbox q WHERE q.order_id = NEW.id AND q.url = w.url
                        AND q.event = '${event}' AND q.status = 'pending');`;

export const TRIGGERS: string[] = [
  // order emails: status changed, or renewed (still active and paid, the end moved forward)
  `CREATE TRIGGER IF NOT EXISTS orders_updated_email AFTER UPDATE OF payment_status, order_status ON orders
   WHEN ${statusChanged}
   BEGIN
     INSERT INTO email_outbox (platform_id, template, to_email, data)
     SELECT NEW.platform_id, 'order-updated', u.email,
            json_object('orderId', NEW.id, 'oldPayment', OLD.payment_status, 'oldStatus', OLD.order_status)
       FROM app_users u WHERE u.id = NEW.app_user_id AND u.email IS NOT NULL AND ${pendingEmail("order-updated")};
   END`,
  `CREATE TRIGGER IF NOT EXISTS orders_renewed_email AFTER UPDATE OF ends_at ON orders
   WHEN ${renewed}
   BEGIN
     INSERT INTO email_outbox (platform_id, template, to_email, data)
     SELECT NEW.platform_id, 'order-renewed', u.email, json_object('orderId', NEW.id, 'oldEndsAt', OLD.ends_at)
       FROM app_users u WHERE u.id = NEW.app_user_id AND u.email IS NOT NULL AND ${pendingEmail("order-renewed")};
   END`,

  // device emails: added to a user, taken from one (moved, unassigned or deleted). When the
  // whole user is deleted, they are gone before their devices are unassigned: no email.
  `CREATE TRIGGER IF NOT EXISTS devices_added_email AFTER INSERT ON devices
   WHEN NEW.app_user_id IS NOT NULL
   BEGIN ${deviceEmail("device-added", "NEW")} END`,
  `CREATE TRIGGER IF NOT EXISTS devices_moved_email AFTER UPDATE OF app_user_id ON devices
   WHEN NEW.app_user_id IS NOT OLD.app_user_id
   BEGIN
     ${deviceEmail("device-removed", "OLD")}
     ${deviceEmail("device-added", "NEW")}
   END`,
  `CREATE TRIGGER IF NOT EXISTS devices_removed_email AFTER DELETE ON devices
   WHEN OLD.app_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM apps WHERE id = OLD.app_id)
   BEGIN ${deviceEmail("device-removed", "OLD")} END`,
  // a deleted user's devices stay, without a user
  `CREATE TRIGGER IF NOT EXISTS app_users_release_devices AFTER DELETE ON app_users
   BEGIN UPDATE devices SET app_user_id = NULL, updated_at = ${NOW} WHERE app_user_id = OLD.id; END`,

  // app webhooks: every order change, to each of the app's webhook URLs
  `CREATE TRIGGER IF NOT EXISTS orders_created_webhooks AFTER INSERT ON orders
   BEGIN ${webhooks("order.created", "'{}'")} END`,
  `CREATE TRIGGER IF NOT EXISTS orders_updated_webhooks AFTER UPDATE OF payment_status, order_status ON orders
   WHEN ${statusChanged}
   BEGIN ${webhooks("order.updated", "json_object('oldPayment', OLD.payment_status, 'oldStatus', OLD.order_status)")} END`,
  `CREATE TRIGGER IF NOT EXISTS orders_renewed_webhooks AFTER UPDATE OF ends_at ON orders
   WHEN ${renewed}
   BEGIN ${webhooks("order.renewed", "'{}'")} END`,
];

/**
 * Columns added after a table was first created (CREATE TABLE IF NOT EXISTS doesn't add them
 * to an existing table): migrate() adds each one that's missing.
 */
export const ADDED_COLUMNS: { table: string; column: string; definition: string }[] = [
  // last heartbeat from the device's app (App API /heartbeat), and the version it runs
  { table: "devices", column: "last_seen_at", definition: "TEXT" },
  { table: "devices", column: "app_version", definition: "TEXT" },
  // a test platform uses the *_TEST payment settings (pay-mode.ts)
  { table: "platforms", column: "is_test", definition: "INTEGER NOT NULL DEFAULT 0" },
];
