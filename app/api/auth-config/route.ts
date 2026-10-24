import { NextResponse } from "next/server";
import { getSsoConfig, passwordLoginEnabled } from "@/lib/sso-config";

// Public: tells the sign-in pages which ways in are turned on
export function GET() {
  const sso = getSsoConfig();
  return NextResponse.json({
    passwordLogin: passwordLoginEnabled(),
    sso: sso ? { name: sso.name } : null,
  });
}
