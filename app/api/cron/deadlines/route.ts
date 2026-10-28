import { NextResponse } from "next/server";
import { rejectUnlessCron } from "@/lib/cron-auth";
import { runDeadlineChecks } from "@/lib/deadlines";

// Reminds assignees of tasks that are due and tells managers about tasks that
// stayed open past the grace period. Meant to be called on a schedule by
// Vercel Cron or a system cron job, with `Authorization: Bearer $CRON_SECRET`.
async function handle(request: Request) {
  const rejected = rejectUnlessCron(request);
  if (rejected) {
    return rejected;
  }
  return NextResponse.json(await runDeadlineChecks());
}

export const GET = handle;
export const POST = handle;
