import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone, which is what the Docker image runs
  output: "standalone",
};

export default withWorkflow(nextConfig);
