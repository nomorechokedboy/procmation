import "server-only";

const DEFAULT_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

export type EmailResult = "sent" | "not_configured" | "failed";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

// Email is optional: with no key or sender, everything else keeps working
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

// Sends one email through Resend and never throws, so a mail problem can not
// break the action that triggered it (accepting a task, inviting a member).
export async function sendEmail(email: OutgoingEmail): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!(apiKey && from)) {
    return "not_configured";
  }

  try {
    const response = await fetch(
      process.env.RESEND_API_URL || DEFAULT_ENDPOINT,
      {
        body: JSON.stringify({
          from,
          html: email.html,
          subject: email.subject,
          text: email.text,
          to: [email.to],
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      // Log Resend's reason (for example an unverified sender domain), but
      // never the request, which carries the key
      const detail = await response.text().catch(() => "");
      console.error(
        `[email] Resend rejected the message (${response.status}): ${detail.slice(0, 300)}`
      );
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error(
      "[email] could not reach Resend:",
      error instanceof Error ? error.message : "unknown error"
    );
    return "failed";
  }
}
