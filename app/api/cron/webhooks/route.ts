import { NextResponse } from "next/server";
import { rejectUnlessCron } from "@/lib/cron-auth";
import { runDueDeliveries } from "@/lib/webhooks/dispatch";

// Retries webhook deliveries that failed and are due again. Call it every
// minute with `Authorization: Bearer $CRON_SECRET`.
async function handle(request: Request) {
  const rejected = rejectUnlessCron(request);
  if (rejected) {
    return rejected;
  }
  return NextResponse.json(await runDueDeliveries());
}

export const GET = handle;
export const POST = handle;
