# Email templates

Prebuilt emails sent by the server (see `src/server/email/render.ts`).

Each email is two files with the same name:

- `<name>.html`: the HTML body. Its first line sets the subject:
  `<!-- subject: Welcome to {{appName}} -->`
- `<name>.txt`: the plain-text version (for mail apps that don't show HTML).

`layout.html` wraps every HTML body. Its `{{{content}}}` slot is where the body goes.

Placeholders:

- `{{name}}` is filled in and HTML-escaped. Use it for anything that comes from users.
- `{{{name}}}` is filled in as is. Only use it for trusted HTML, such as the layout's content.
- `{{#name}}…{{/name}}` keeps the part between only when `name` has a value (e.g. the pay button).

Every email can use `{{year}}`, `{{name}}`, `{{email}}`, `{{appName}}`, `{{platformName}}` and `{{supportEmail}}`, plus its own values (built in `src/server/email/messages.ts`):

| Template | Sent when | Its own values |
|---|---|---|
| `welcome` | A user signs up through the App API | none |
| `device-added` | A device is added to a user, or moved to them | `deviceName`, `deviceUid`, `when` |
| `device-removed` | A user's device is deleted, or moved away | `deviceName`, `deviceUid`, `when` |
| `order-created` | An order is created (dashboard or App API) | `orderNumber`, `billing`, `itemRows` (HTML), `itemLines` (text), `total`, `payUrl`, `payUntil` |
| `order-updated` | An order's payment or order status changes | `headline`, `message`, `orderNumber`, `paymentStatus`, `orderStatus`, `payUrl` |
| `order-renewed` | A subscription renews: still active and paid, the end date moves forward (Stripe, Google Play, or Renew in the dashboard) | `orderNumber`, `item`, `billing`, `amount` (this renewal's payment, if reported), `until` |

Keep the CSS inline and the layout table-based. Many mail apps (Outlook, Gmail) drop `<style>` blocks and modern CSS.
