import { route } from "@/server/api/route";
import { ApiError, json } from "@/server/http";
import { assertPublicHost } from "@/server/net";
import { findSmtp, replyToFor, transportFor } from "@/server/smtp";
import { activePlatform } from "@/server/users";

/** Connects and logs in; sends a test email when `to` is given. */
export const POST = route("smtp.test", async ({ user, params, body }) => {
  const server = await findSmtp(params.id, activePlatform(user));
  if (!server) throw new ApiError(404, "NOT_FOUND");

  try {
    await assertPublicHost(server.host);
  } catch {
    throw new ApiError(400, "SMTP_TEST_FAILED", "This host is on a private network");
  }
  const transport = transportFor(server);
  try {
    await transport.verify();
    if (body.to) {
      const replyTo = replyToFor(server);
      await transport.sendMail({
        from: server.from_name
          ? `"${server.from_name}" <${server.from_email}>`
          : server.from_email,
        to: body.to,
        ...(replyTo ? { replyTo } : {}),
        subject: "Pay Portal SMTP test",
        text: `This is a test email from Pay Portal using the "${server.name}" SMTP server.`,
      });
    }
    return json({ ok: true, sent: !!body.to });
  } catch (err) {
    // The SMTP server's own answer (e.g. "Invalid login") helps the admin fix the settings; a
    // connection failure only says so (its details would map the network behind the server)
    const e = err as Error & { code?: string; responseCode?: number };
    throw new ApiError(
      400,
      "SMTP_TEST_FAILED",
      e.responseCode ? e.message : "Couldn't connect to the SMTP server — check the host, port and security",
    );
  } finally {
    transport.close();
  }
});
