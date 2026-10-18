import "server-only";

import type { UserRole } from "@/lib/db/schema";
import * as m from "@/paraglide/messages";
import { type EmailResult, sendEmail } from "./send";
import { appName, emailLocale, renderEmail } from "./template";

type InviteEmail = {
  to: string;
  inviterName: string;
  role: UserRole;
  inviteUrl: string;
  expiresAt: Date;
};

// Emails the invitation link. The caller keeps showing the link to the admin,
// so a missing or failing mail provider only means they share it by hand.
export function sendInviteEmail(input: InviteEmail): Promise<EmailResult> {
  const locale = emailLocale();
  const opts = { locale };
  const app = appName();
  const role =
    input.role === "admin" ? m.role_admin({}, opts) : m.role_member({}, opts);

  const rendered = renderEmail({
    body: m.email_invite_body(
      {
        app,
        date: input.expiresAt.toLocaleDateString(locale),
        inviter: input.inviterName,
        role: role.toLowerCase(),
      },
      opts
    ),
    ctaLabel: m.email_invite_cta({}, opts),
    ctaUrl: input.inviteUrl,
    heading: m.email_invite_heading({ app }, opts),
    locale,
  });

  return sendEmail({
    html: rendered.html,
    subject: m.email_invite_subject({ app }, opts),
    text: rendered.text,
    to: input.to,
  });
}
