import { config } from "dotenv";
import type { Config } from "drizzle-kit";

config();

export default {
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://localhost:5432/workflow",
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./lib/db/schema.ts",
} satisfies Config;
