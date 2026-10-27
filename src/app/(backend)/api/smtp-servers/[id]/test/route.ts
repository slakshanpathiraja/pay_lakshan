import { route } from "@/server/api/route";
import { ApiError, json } from "@/server/http";
import { findSmtp, transportFor } from "@/server/smtp";
import { activePlatform } from "@/server/users";

/** Connects and logs in; sends a test email when `to` is given. */
export const POST = route("smtp.test", async ({ user, params, body }) => {
  const server = await findSmtp(params.id, activePlatform(user));
  if (!server) throw new ApiError(404, "NOT_FOUND");

  const transport = transportFor(server);
  try {
    await transport.verify();
    if (body.to) {
      await transport.sendMail({
        from: server.from_name
          ? `"${server.from_name}" <${server.from_email}>`
          : server.from_email,
        to: body.to,
        subject: "Pay Portal SMTP test",
        text: `This is a test email from Pay Portal using the "${server.name}" SMTP server.`,
      });
    }
    return json({ ok: true, sent: !!body.to });
  } catch (err) {
    // The SMTP server's own message (e.g. "Invalid login") helps the admin fix the settings.
    throw new ApiError(400, "SMTP_TEST_FAILED", (err as Error).message);
  } finally {
    transport.close();
  }
});
