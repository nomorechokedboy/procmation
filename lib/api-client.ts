/**
 * API Client for making type-safe API calls to the backend
 * Replaces server actions with API endpoints
 */

import type {
  Case,
  CasePriority,
  CaseStatus,
  CaseTimelineEntry,
  Notification,
  Task,
  TaskStatus,
} from "./db/schema";
import type { IntegrationConfig, IntegrationType } from "./types/integration";
import type { FormField } from "./types/process-form";
import type { WorkflowEdge, WorkflowNode } from "./workflow-store";

// Workflow data types
export type WorkflowVisibility = "private" | "public";

export type WorkflowData = {
  id?: string;
  name?: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  visibility?: WorkflowVisibility;
};

export type SavedWorkflow = WorkflowData & {
  id: string;
  name: string;
  visibility: WorkflowVisibility;
  createdAt: string;
  updatedAt: string;
  isOwner?: boolean;
};

// API error class
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// Helper function to make API calls
async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new ApiError(response.status, error.error || "Request failed");
  }

  return response.json();
}

// AI API

type StreamMessage = {
  type: "operation" | "complete" | "error";
  operation?: {
    op:
      | "setName"
      | "setDescription"
      | "addNode"
      | "addEdge"
      | "removeNode"
      | "removeEdge"
      | "updateNode";
    name?: string;
    description?: string;
    node?: unknown;
    edge?: unknown;
    nodeId?: string;
    edgeId?: string;
    updates?: {
      position?: { x: number; y: number };
      data?: unknown;
    };
  };
  error?: string;
};

type StreamState = {
  buffer: string;
  currentData: WorkflowData;
};

type OperationHandler = (
  op: StreamMessage["operation"],
  state: StreamState
) => void;

function handleSetName(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.name) {
    state.currentData.name = op.name;
  }
}

function handleSetDescription(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.description) {
    state.currentData.description = op.description;
  }
}

function handleAddNode(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.node) {
    state.currentData.nodes = [
      ...state.currentData.nodes,
      op.node as WorkflowNode,
    ];
  }
}

function handleAddEdge(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.edge) {
    state.currentData.edges = [
      ...state.currentData.edges,
      op.edge as WorkflowEdge,
    ];
  }
}

function handleRemoveNode(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.nodeId) {
    state.currentData.nodes = state.currentData.nodes.filter(
      (n) => n.id !== op.nodeId
    );
    state.currentData.edges = state.currentData.edges.filter(
      (e) => e.source !== op.nodeId && e.target !== op.nodeId
    );
  }
}

function handleRemoveEdge(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.edgeId) {
    state.currentData.edges = state.currentData.edges.filter(
      (e) => e.id !== op.edgeId
    );
  }
}

function handleUpdateNode(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (op?.nodeId && op.updates) {
    state.currentData.nodes = state.currentData.nodes.map((n) => {
      if (n.id === op.nodeId) {
        return {
          ...n,
          ...(op.updates?.position ? { position: op.updates.position } : {}),
          ...(op.updates?.data
            ? { data: { ...n.data, ...op.updates.data } }
            : {}),
        };
      }
      return n;
    });
  }
}

const operationHandlers: Record<string, OperationHandler> = {
  setName: handleSetName,
  setDescription: handleSetDescription,
  addNode: handleAddNode,
  addEdge: handleAddEdge,
  removeNode: handleRemoveNode,
  removeEdge: handleRemoveEdge,
  updateNode: handleUpdateNode,
};

function applyOperation(
  op: StreamMessage["operation"],
  state: StreamState
): void {
  if (!op?.op) {
    return;
  }

  const handler = operationHandlers[op.op];
  if (handler) {
    handler(op, state);
  }
}

function processStreamLine(
  line: string,
  onUpdate: (data: WorkflowData) => void,
  state: StreamState
): void {
  if (!line.trim()) {
    return;
  }

  try {
    const message = JSON.parse(line) as StreamMessage;

    if (message.type === "operation" && message.operation) {
      applyOperation(message.operation, state);
      onUpdate({ ...state.currentData });
    } else if (message.type === "error") {
      console.error("[API Client] Error:", message.error);
      throw new Error(message.error);
    }
  } catch (error) {
    console.error("[API Client] Failed to parse JSONL line:", error);
  }
}

function processStreamChunk(
  value: Uint8Array,
  decoder: TextDecoder,
  onUpdate: (data: WorkflowData) => void,
  state: StreamState
): void {
  state.buffer += decoder.decode(value, { stream: true });

  // Process complete JSONL lines
  const lines = state.buffer.split("\n");
  state.buffer = lines.pop() || "";

  for (const line of lines) {
    processStreamLine(line, onUpdate, state);
  }
}

export const aiApi = {
  generate: (
    prompt: string,
    existingWorkflow?: {
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
      name?: string;
    }
  ) =>
    apiCall<WorkflowData>("/api/ai/generate", {
      method: "POST",
      body: JSON.stringify({ prompt, existingWorkflow }),
    }),
  generateStream: async (
    prompt: string,
    onUpdate: (data: WorkflowData) => void,
    existingWorkflow?: {
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
      name?: string;
    }
  ): Promise<WorkflowData> => {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, existingWorkflow }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: StreamState = {
      buffer: "",
      currentData: existingWorkflow
        ? {
            nodes: existingWorkflow.nodes || [],
            edges: existingWorkflow.edges || [],
            name: existingWorkflow.name,
          }
        : { nodes: [], edges: [] },
    };

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        processStreamChunk(value, decoder, onUpdate, state);
      }

      return state.currentData;
    } finally {
      reader.releaseLock();
    }
  },
};

export type Integration = {
  id: string;
  name: string;
  type: IntegrationType;
  isManaged?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationWithConfig = Integration & {
  config: IntegrationConfig;
};

// AI Gateway types
export type AiGatewayStatusResponse = {
  enabled: boolean;
  signedIn: boolean;
  isVercelUser: boolean;
  hasManagedKey: boolean;
  managedIntegrationId?: string;
};

export type AiGatewayConsentResponse = {
  success: boolean;
  hasManagedKey: boolean;
  managedIntegrationId?: string;
  error?: string;
};

export type VercelTeam = {
  id: string;
  name: string;
  slug: string;
  avatar?: string;
  isPersonal: boolean;
};

export type AiGatewayTeamsResponse = {
  teams: VercelTeam[];
};

// Integration API
export const integrationApi = {
  // List all integrations
  getAll: (type?: IntegrationType) =>
    apiCall<Integration[]>(`/api/integrations${type ? `?type=${type}` : ""}`),

  // Get single integration with config
  get: (id: string) =>
    apiCall<IntegrationWithConfig>(`/api/integrations/${id}`),

  // Create integration
  create: (data: {
    name: string;
    type: IntegrationType;
    config: IntegrationConfig;
  }) =>
    apiCall<Integration>("/api/integrations", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Update integration
  update: (id: string, data: { name?: string; config?: IntegrationConfig }) =>
    apiCall<IntegrationWithConfig>(`/api/integrations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Delete integration
  delete: (id: string) =>
    apiCall<{ success: boolean }>(`/api/integrations/${id}`, {
      method: "DELETE",
    }),

  // Test existing integration connection
  testConnection: (integrationId: string) =>
    apiCall<{ status: "success" | "error"; message: string }>(
      `/api/integrations/${integrationId}/test`,
      {
        method: "POST",
      }
    ),

  // Test credentials without saving
  testCredentials: (data: {
    type: IntegrationType;
    config: IntegrationConfig;
  }) =>
    apiCall<{ status: "success" | "error"; message: string }>(
      "/api/integrations/test",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),
};

// User API
export const userApi = {
  get: () =>
    apiCall<{
      id: string;
      name: string | null;
      email: string;
      image: string | null;
      isAnonymous: boolean | null;
      providerId: string | null;
    }>("/api/user"),

  update: (data: { name?: string; email?: string }) =>
    apiCall<{ success: boolean }>("/api/user", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Workflow API
export const workflowApi = {
  // Get all workflows
  getAll: () => apiCall<SavedWorkflow[]>("/api/workflows"),

  // Get a specific workflow
  getById: (id: string) => apiCall<SavedWorkflow>(`/api/workflows/${id}`),

  // Create a new workflow
  create: (workflow: Omit<WorkflowData, "id">) =>
    apiCall<SavedWorkflow>("/api/workflows/create", {
      method: "POST",
      body: JSON.stringify(workflow),
    }),

  // Update a workflow
  update: (id: string, workflow: Partial<WorkflowData>) =>
    apiCall<SavedWorkflow>(`/api/workflows/${id}`, {
      method: "PATCH",
      body: JSON.stringify(workflow),
    }),

  // Delete a workflow
  delete: (id: string) =>
    apiCall<{ success: boolean }>(`/api/workflows/${id}`, {
      method: "DELETE",
    }),

  // Duplicate a workflow
  duplicate: (id: string) =>
    apiCall<SavedWorkflow>(`/api/workflows/${id}/duplicate`, {
      method: "POST",
    }),

  // Get current workflow state
  getCurrent: () => apiCall<WorkflowData>("/api/workflows/current"),

  // Save current workflow state
  saveCurrent: (nodes: WorkflowNode[], edges: WorkflowEdge[]) =>
    apiCall<WorkflowData>("/api/workflows/current", {
      method: "POST",
      body: JSON.stringify({ nodes, edges }),
    }),

  // Execute workflow
  execute: (id: string, input: Record<string, unknown> = {}) =>
    apiCall<{
      executionId: string;
      status: string;
      output?: unknown;
      error?: string;
      duration?: number;
    }>(`/api/workflow/${id}/execute`, {
      method: "POST",
      body: JSON.stringify({ input }),
    }),

  // Trigger workflow via webhook
  triggerWebhook: (id: string, input: Record<string, unknown> = {}) =>
    apiCall<{
      executionId: string;
      status: string;
    }>(`/api/workflows/${id}/webhook`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // Get workflow code
  getCode: (id: string) =>
    apiCall<{ code: string; workflowName: string }>(
      `/api/workflows/${id}/code`
    ),

  // Get executions
  getExecutions: (id: string) =>
    apiCall<
      Array<{
        id: string;
        workflowId: string;
        userId: string;
        status: string;
        input: unknown;
        output: unknown;
        error: string | null;
        startedAt: Date;
        completedAt: Date | null;
        duration: string | null;
      }>
    >(`/api/workflows/${id}/executions`),

  // Delete executions
  deleteExecutions: (id: string) =>
    apiCall<{ success: boolean; deletedCount: number }>(
      `/api/workflows/${id}/executions`,
      {
        method: "DELETE",
      }
    ),

  // Get execution logs
  getExecutionLogs: (executionId: string) =>
    apiCall<{
      execution: {
        id: string;
        workflowId: string;
        userId: string;
        status: string;
        input: unknown;
        output: unknown;
        error: string | null;
        startedAt: Date;
        completedAt: Date | null;
        duration: string | null;
        workflow: {
          id: string;
          name: string;
          nodes: unknown;
          edges: unknown;
        };
      };
      logs: Array<{
        id: string;
        executionId: string;
        nodeId: string;
        nodeName: string;
        nodeType: string;
        status: "pending" | "running" | "success" | "error";
        input: unknown;
        output: unknown;
        error: string | null;
        startedAt: Date;
        completedAt: Date | null;
        duration: string | null;
      }>;
    }>(`/api/workflows/executions/${executionId}/logs`),

  // Get execution status
  getExecutionStatus: (executionId: string) =>
    apiCall<{
      status: string;
      nodeStatuses: Array<{
        nodeId: string;
        status: "pending" | "running" | "success" | "error";
      }>;
    }>(`/api/workflows/executions/${executionId}/status`),

  // Download workflow
  download: (id: string) =>
    apiCall<{
      success: boolean;
      files?: Record<string, string>;
      error?: string;
    }>(`/api/workflows/${id}/download`),

  // Auto-save with debouncing (kept for backwards compatibility)
  autoSaveCurrent: (() => {
    let autosaveTimeout: NodeJS.Timeout | null = null;
    const AUTOSAVE_DELAY = 2000;

    return (nodes: WorkflowNode[], edges: WorkflowEdge[]): void => {
      if (autosaveTimeout) {
        clearTimeout(autosaveTimeout);
      }

      autosaveTimeout = setTimeout(() => {
        workflowApi.saveCurrent(nodes, edges).catch((error) => {
          console.error("Auto-save failed:", error);
        });
      }, AUTOSAVE_DELAY);
    };
  })(),

  // Auto-save specific workflow with debouncing
  autoSaveWorkflow: (() => {
    let autosaveTimeout: NodeJS.Timeout | null = null;
    const AUTOSAVE_DELAY = 2000;

    return (
      id: string,
      data: Partial<WorkflowData>,
      debounce = true
    ): Promise<SavedWorkflow> | undefined => {
      if (!debounce) {
        return workflowApi.update(id, data);
      }

      if (autosaveTimeout) {
        clearTimeout(autosaveTimeout);
      }

      autosaveTimeout = setTimeout(() => {
        workflowApi.update(id, data).catch((error) => {
          console.error("Auto-save failed:", error);
        });
      }, AUTOSAVE_DELAY);
    };
  })(),
};

// AI Gateway API (User Keys feature)
export const aiGatewayApi = {
  // Get status (whether feature is enabled, user has managed key, etc.)
  getStatus: () => apiCall<AiGatewayStatusResponse>("/api/ai-gateway/status"),

  // Get available Vercel teams
  getTeams: () => apiCall<AiGatewayTeamsResponse>("/api/ai-gateway/teams"),

  // Grant consent and create managed API key
  consent: (teamId: string, teamName: string) =>
    apiCall<AiGatewayConsentResponse>("/api/ai-gateway/consent", {
      method: "POST",
      body: JSON.stringify({ teamId, teamName }),
    }),

  // Revoke consent and delete managed API key
  revokeConsent: () =>
    apiCall<AiGatewayConsentResponse>("/api/ai-gateway/consent", {
      method: "DELETE",
    }),
};

// Setup, invitations and members (invite-only access)
export type UserRole = "admin" | "member";

export type Member = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  createdAt: string;
  departmentId: string | null;
  managerId: string | null;
  jobTitle: string | null;
};

export type MemberProfileUpdate = {
  departmentId?: string | null;
  managerId?: string | null;
  jobTitle?: string | null;
};

export type Department = {
  id: string;
  name: string;
  parentId: string | null;
  memberCount: number;
};

export type ProcessStatus = "draft" | "published" | "archived";

export type ProcessSummary = {
  id: string;
  workflowId: string;
  name: string;
  description: string | null;
  status: ProcessStatus;
  version: number;
  category: string | null;
  startFormFields: FormField[];
  publishedAt: string | null;
  updatedAt: string;
};

export type InvitationSummary = {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

export const setupApi = {
  getStatus: () => apiCall<{ needsSetup: boolean }>("/api/setup"),

  createAdmin: (data: { name: string; email: string; password: string }) =>
    apiCall<{ success: boolean }>("/api/setup", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const inviteApi = {
  list: () => apiCall<InvitationSummary[]>("/api/invites"),

  create: (data: { email: string; role: UserRole }) =>
    apiCall<{
      id: string;
      email: string;
      role: UserRole;
      expiresAt: string;
      inviteUrl: string;
    }>("/api/invites", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  revoke: (inviteId: string) =>
    apiCall<{ success: boolean }>(`/api/invites/${inviteId}`, {
      method: "DELETE",
    }),

  lookup: (token: string) =>
    apiCall<{ email: string; role: UserRole }>(`/api/invite/${token}`),

  accept: (token: string, data: { name: string; password: string }) =>
    apiCall<{ success: boolean; email: string }>(
      `/api/invite/${token}/accept`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),
};

export const memberApi = {
  list: () => apiCall<Member[]>("/api/members"),

  updateProfile: (memberId: string, data: MemberProfileUpdate) =>
    apiCall<{ success: boolean }>(`/api/members/${memberId}/profile`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  updateRole: (memberId: string, role: UserRole) =>
    apiCall<{ success: boolean }>(`/api/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
};

export const departmentApi = {
  list: () => apiCall<Department[]>("/api/departments"),

  create: (data: { name: string; parentId?: string | null }) =>
    apiCall<Omit<Department, "memberCount">>("/api/departments", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (
    departmentId: string,
    data: { name?: string; parentId?: string | null }
  ) =>
    apiCall<Omit<Department, "memberCount">>(
      `/api/departments/${departmentId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),

  delete: (departmentId: string) =>
    apiCall<{ success: boolean }>(`/api/departments/${departmentId}`, {
      method: "DELETE",
    }),
};

export const processApi = {
  list: () => apiCall<ProcessSummary[]>("/api/processes"),

  get: (processId: string) =>
    apiCall<ProcessSummary>(`/api/processes/${processId}`),

  create: (data: {
    workflowId: string;
    category?: string | null;
    startFormFields?: FormField[];
  }) =>
    apiCall<ProcessSummary>("/api/processes", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (
    processId: string,
    data: {
      status?: ProcessStatus;
      category?: string | null;
      startFormFields?: FormField[];
    }
  ) =>
    apiCall<ProcessSummary>(`/api/processes/${processId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Dates arrive as ISO strings once a row has been through JSON
type Serialized<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K];
};

export type CaseRecord = Serialized<Case>;
export type CaseTimelineRecord = Serialized<CaseTimelineEntry>;
export type TaskRecord = Serialized<Task>;
export type NotificationRecord = Serialized<Notification>;

export type CaseDetail = {
  case: CaseRecord;
  timeline: CaseTimelineRecord[];
  tasks: TaskRecord[];
};

export const caseApi = {
  list: (filters?: {
    all?: boolean;
    status?: CaseStatus;
    priority?: CasePriority;
    processId?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.all) {
      params.set("all", "true");
    }
    if (filters?.status) {
      params.set("status", filters.status);
    }
    if (filters?.priority) {
      params.set("priority", filters.priority);
    }
    if (filters?.processId) {
      params.set("processId", filters.processId);
    }
    const query = params.toString();
    return apiCall<CaseRecord[]>(`/api/bpma/cases${query ? `?${query}` : ""}`);
  },

  get: (caseId: string) => apiCall<CaseDetail>(`/api/bpma/cases/${caseId}`),

  create: (data: {
    processDefinitionId: string;
    title: string;
    priority?: CasePriority;
    dueAt?: string | null;
    metadata?: Record<string, unknown>;
  }) =>
    apiCall<CaseRecord>("/api/bpma/cases", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (
    caseId: string,
    data: {
      title?: string;
      status?: CaseStatus;
      priority?: CasePriority;
      dueAt?: string | null;
      participants?: string[];
      metadata?: Record<string, unknown>;
    }
  ) =>
    apiCall<CaseRecord>(`/api/bpma/cases/${caseId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export const taskApi = {
  list: (status?: TaskStatus) =>
    apiCall<TaskRecord[]>(
      `/api/bpma/tasks${status ? `?status=${status}` : ""}`
    ),

  get: (taskId: string) => apiCall<TaskRecord>(`/api/bpma/tasks/${taskId}`),

  complete: (
    taskId: string,
    data: { outcome?: string; values?: Record<string, unknown> }
  ) =>
    apiCall<TaskRecord>(`/api/bpma/tasks/${taskId}/complete`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  reassign: (taskId: string, assigneeId: string) =>
    apiCall<TaskRecord>(`/api/bpma/tasks/${taskId}/reassign`, {
      method: "POST",
      body: JSON.stringify({ assigneeId }),
    }),
};

export const notificationApi = {
  list: (options?: { unread?: boolean; limit?: number }) => {
    const params = new URLSearchParams();
    if (options?.unread) {
      params.set("unread", "true");
    }
    if (options?.limit) {
      params.set("limit", String(options.limit));
    }
    const query = params.toString();
    return apiCall<{ notifications: NotificationRecord[]; unreadCount: number }>(
      `/api/bpma/notifications${query ? `?${query}` : ""}`
    );
  },

  markRead: (ids: string[]) =>
    apiCall<{ success: boolean }>("/api/bpma/notifications", {
      method: "PATCH",
      body: JSON.stringify({ ids }),
    }),

  markAllRead: () =>
    apiCall<{ success: boolean }>("/api/bpma/notifications", {
      method: "PATCH",
      body: JSON.stringify({ all: true }),
    }),
};

// Export all APIs as a single object
export const api = {
  ai: aiApi,
  aiGateway: aiGatewayApi,
  case: caseApi,
  department: departmentApi,
  integration: integrationApi,
  invite: inviteApi,
  member: memberApi,
  notification: notificationApi,
  process: processApi,
  setup: setupApi,
  task: taskApi,
  user: userApi,
  workflow: workflowApi,
};
