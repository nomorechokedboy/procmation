import { NextResponse } from "next/server";
import postgres from "postgres";
import { auth } from "@/lib/auth";
import type {
  IntegrationConfig,
  IntegrationType,
} from "@/lib/types/integration";
import {
  getCredentialMapping,
  getIntegration as getPluginFromRegistry,
} from "@/plugins";

export type TestConnectionRequest = {
  type: IntegrationType;
  config: IntegrationConfig;
};

export type TestConnectionResult = {
  status: "success" | "error";
  message: string;
};

/**
 * POST /api/integrations/test
 * Test connection credentials without saving
 */
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: Partial<TestConnectionRequest> = await request.json();

    if (!(body.type && body.config)) {
      return NextResponse.json(
        { error: "Type and config are required" },
        { status: 400 }
      );
    }

    if (body.type === "database") {
      const result = await testDatabaseConnection(body.config.url);
      return NextResponse.json(result);
    }

    const plugin = getPluginFromRegistry(body.type);

    if (!plugin) {
      return NextResponse.json(
        { error: "Invalid integration type" },
        { status: 400 }
      );
    }

    if (!plugin.testConfig) {
      return NextResponse.json(
        { error: "Integration does not support testing" },
        { status: 400 }
      );
    }

    const credentials = getCredentialMapping(plugin, body.config);

    const testFn = await plugin.testConfig.getTestFunction();
    const testResult = await testFn(credentials);

    const result: TestConnectionResult = {
      message: testResult.success
        ? "Connection successful"
        : testResult.error || "Connection failed",
      status: testResult.success ? "success" : "error",
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to test connection:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to test connection",
        status: "error",
      },
      { status: 500 }
    );
  }
}

async function testDatabaseConnection(
  databaseUrl?: string
): Promise<TestConnectionResult> {
  let connection: postgres.Sql | null = null;

  try {
    if (!databaseUrl) {
      return {
        message: "Connection failed",
        status: "error",
      };
    }

    connection = postgres(databaseUrl, {
      connect_timeout: 5,
      idle_timeout: 5,
      max: 1,
    });

    await connection`SELECT 1`;

    return {
      message: "Connection successful",
      status: "success",
    };
  } catch {
    return {
      message: "Connection failed",
      status: "error",
    };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}
