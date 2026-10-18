import { execSync } from "node:child_process";

const { VERCEL, VERCEL_ENV, DATABASE_URL } = process.env;

// Run migrations on every Vercel build (production and preview), so a fresh
// test deployment gets its tables. Local builds skip them.
if (VERCEL) {
  if (!DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set for this environment. Add it in the Vercel project settings."
    );
    process.exit(1);
  }
  console.log(`Running database migrations (VERCEL_ENV=${VERCEL_ENV})...`);
  try {
    execSync("pnpm db:migrate", { stdio: "inherit" });
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
} else {
  console.log("Skipping migrations (not a Vercel build)");
}
