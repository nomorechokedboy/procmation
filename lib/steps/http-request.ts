/**
 * Executable step function for HTTP Request action
 */
import "server-only";

import { getErrorMessage } from "../utils";
import { type StepInput, withStepLogging } from "./step-handler";

type HttpRequestResult =
  | { success: true; data: unknown; status: number }
  | { success: false; error: string; status?: number };

export type HttpRequestInput = StepInput & {
  endpoint: string;
  httpMethod: string;
  httpHeaders?: string;
  httpBody?: string;
};

function parseHeaders(httpHeaders?: string): Record<string, string> {
  if (!httpHeaders) {
    return {};
  }
  try {
    return JSON.parse(httpHeaders);
  } catch {
    return {};
  }
}

function parseBody(httpMethod: string, httpBody?: string): string | undefined {
  if (httpMethod === "GET" || !httpBody) {
    return;
  }
  try {
    const parsedBody = JSON.parse(httpBody);
    return Object.keys(parsedBody).length > 0
      ? JSON.stringify(parsedBody)
      : undefined;
  } catch {
    const trimmed = httpBody.trim();
    return trimmed && trimmed !== "{}" ? httpBody : undefined;
  }
}

function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

/**
 * HTTP request logic
 */
async function httpRequest(
  input: HttpRequestInput
): Promise<HttpRequestResult> {
  if (!input.endpoint) {
    return {
      error: "HTTP request failed: URL is required",
      success: false,
    };
  }

  try {
    const response = await fetch(input.endpoint, {
      body: parseBody(input.httpMethod, input.httpBody),
      headers: parseHeaders(input.httpHeaders),
      method: input.httpMethod,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return {
        error: `HTTP request failed with status ${response.status}: ${errorText}`,
        status: response.status,
        success: false,
      };
    }

    const data = await parseResponse(response);
    return { data, status: response.status, success: true };
  } catch (error) {
    return {
      error: `HTTP request failed: ${getErrorMessage(error)}`,
      success: false,
    };
  }
}

/**
 * HTTP Request Step
 * Makes an HTTP request to an endpoint
 */
// biome-ignore lint/suspicious/useAwait: workflow "use step" requires async
export async function httpRequestStep(
  input: HttpRequestInput
): Promise<HttpRequestResult> {
  "use step";
  return withStepLogging(input, () => httpRequest(input));
}
httpRequestStep.maxRetries = 0;
