import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/db/bpma";
import { type CaseStatus, type NotificationType, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/send";
import {
  appLink,
  appName,
  emailLocale,
  renderEmail,
} from "@/lib/email/template";
import { caseStatusLabel } from "@/lib/i18n/bpma-labels";
import * as m from "@/paraglide/messages";
import type { Locale } from "@/paraglide/runtime";

export type NotifyInput = {
  userId: string;
  type: Extract<
    NotificationType,
    | "task_assigned"
    | "task_overdue"
    | "escalation"
    | "mentioned"
    | "case_completed"
    | "case_failed"
    | "case_cancelled"
  >;
  caseId: string | null;
  taskId?: string | null;
  caseNumber: string;
  caseTitle: string;
  taskName?: string;
  // For an escalation: whose task is overdue
  assigneeName?: string;
  // For a mention: who tagged the person
  actorName?: string;
  status?: CaseStatus;
};

type Content = { subject: string; heading: string; body: string; cta: string };

function finalStatus(input: NotifyInput): CaseStatus {
  if (input.type === "case_failed") {
    return "failed";
  }
  if (input.type === "case_cancelled") {
    return "cancelled";
  }
  return input.status ?? "completed";
}

function contentFor(input: NotifyInput, locale: Locale): Content {
  const opts = { locale };
  const common = { caseNumber: input.caseNumber, caseTitle: input.caseTitle };

  if (input.type === "task_assigned") {
    const task = input.taskName ?? "";
    return {
      body: m.email_task_body({ ...common, task }, opts),
      cta: m.email_task_cta({}, opts),
      heading: m.email_task_heading({}, opts),
      subject: m.email_task_subject({ task }, opts),
    };
  }

  if (input.type === "task_overdue") {
    const task = input.taskName ?? "";
    return {
      body: m.email_overdue_body({ ...common, task }, opts),
      cta: m.email_task_cta({}, opts),
      heading: m.email_overdue_heading({}, opts),
      subject: m.email_overdue_subject({ task }, opts),
    };
  }

  if (input.type === "escalation") {
    const task = input.taskName ?? "";
    const person = input.assigneeName ?? "";
    return {
      body: m.email_escalated_body({ ...common, person, task }, opts),
      cta: m.email_case_cta({}, opts),
      heading: m.email_escalated_heading({}, opts),
      subject: m.email_escalated_subject({ person, task }, opts),
    };
  }

  if (input.type === "mentioned") {
    const person = input.actorName ?? "";
    return {
      body: m.email_mention_body({ ...common, person }, opts),
      cta: m.email_case_cta({}, opts),
      heading: m.email_mention_heading({ person }, opts),
      subject: m.email_mention_subject({ person }, opts),
    };
  }

  const status = finalStatus(input);
  const statusText = caseStatusLabel(status, locale).toLowerCase();
  let body = m.email_case_done_body({ ...common, status: statusText }, opts);
  if (input.type === "case_failed") {
    body = m.email_case_failed_body(common, opts);
  } else if (input.type === "case_cancelled") {
    body = m.email_case_cancelled_body(common, opts);
  }
  return {
    body,
    cta: m.email_case_cta({}, opts),
    heading: m.email_case_subject(
      { caseNumber: input.caseNumber, status: statusText },
      opts
    ),
    subject: m.email_case_subject(
      { caseNumber: input.caseNumber, status: statusText },
      opts
    ),
  };
}

function linkFor(input: NotifyInput): string {
  if (input.type === "task_overdue" && input.taskId) {
    return appLink(`/tasks/${input.taskId}`);
  }
  if (input.type === "task_assigned" && input.taskId) {
    return appLink(`/tasks/${input.taskId}`);
  }
  return input.caseId ? appLink(`/cases/${input.caseId}`) : appLink("/");
}

async function emailRecipient(input: NotifyInput) {
  const [recipient] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, input.userId));
  if (!recipient?.email) {
    return;
  }
  const locale = emailLocale();
  const content = contentFor(input, locale);
  const rendered = renderEmail({
    body: content.body,
    ctaLabel: content.cta,
    ctaUrl: linkFor(input),
    heading: content.heading,
    locale,
  });
  await sendEmail({
    html: rendered.html,
    subject: `[${appName()}] ${content.subject}`,
    text: rendered.text,
    to: recipient.email,
  });
}

// Tells a person about something: always in the app, and by email when the
// mail provider is set up. A failure to email never fails the caller.
export async function notifyUser(input: NotifyInput): Promise<void> {
  const english = contentFor(input, "en");
  await createNotification({
    body: input.taskName ?? input.caseTitle,
    caseId: input.caseId,
    data: {
      actorName: input.actorName,
      caseNumber: input.caseNumber,
      caseTitle: input.caseTitle,
      status: input.status,
      taskName: input.taskName,
    },
    taskId: input.taskId ?? null,
    title: english.heading,
    type: input.type,
    userId: input.userId,
  });

  try {
    await emailRecipient(input);
  } catch (error) {
    console.error(
      "[notify] could not send email:",
      error instanceof Error ? error.message : "unknown error"
    );
  }
}
