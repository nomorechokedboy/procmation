import { config } from "dotenv";
import type { Config } from "drizzle-kit";

config();

export default {
    schema: ["./lib/db/schema.ts", "./lib/db/schema-bpma.ts"],
    out: "./drizzle",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL || "postgres://localhost:5432/workflow",
    },
} satisfies Config;
