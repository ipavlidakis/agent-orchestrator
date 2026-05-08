import {
  normalizeAgentPermissionMode,
  isOrchestratorSession,
  type AgentPermissionMode,
  type AgentSpecificConfig,
  type DefaultPlugins,
  type ModelReasoningEffort,
  type PromptRole,
  type ProjectConfig,
} from "./types.js";

export type SessionRole = "orchestrator" | "worker";

export interface ResolvedAgentSelection {
  role: SessionRole;
  agentName: string;
  agentConfig: AgentSpecificConfig;
  model?: string;
  reasoningEffort?: ModelReasoningEffort;
  permissions?: AgentPermissionMode;
  subagent?: string;
}

const PROMPT_ROLE_PATTERN = /^\s*Role:\s*(Planner|Worker|Reviewer)\s*$/im;
const PICKUP_AGENT_LABEL_PATTERN = /^pickup-agent:(planner|worker|reviewer)$/i;

export function detectPromptRole(prompt: string | undefined): PromptRole | undefined {
  if (!prompt) return undefined;
  const match = prompt.match(PROMPT_ROLE_PATTERN);
  if (!match) return undefined;
  return match[1].toLowerCase() as PromptRole;
}

export function detectPickupAgentRole(labels: string[] | undefined): PromptRole | undefined {
  for (const label of labels ?? []) {
    const match = label.trim().match(PICKUP_AGENT_LABEL_PATTERN);
    if (match) return match[1].toLowerCase() as PromptRole;
  }
  return undefined;
}

function pickReasoningEffort(
  config: AgentSpecificConfig | undefined,
): ModelReasoningEffort | undefined {
  const value =
    config?.reasoningEffort ?? config?.modelReasoningEffort ?? config?.model_reasoning_effort;
  return typeof value === "string" ? (value as ModelReasoningEffort) : undefined;
}

export function resolveSessionRole(
  sessionId: string,
  metadata: Record<string, string> | undefined,
  sessionPrefix: string,
  allSessionPrefixes?: string[],
): SessionRole {
  return isOrchestratorSession({ id: sessionId, metadata }, sessionPrefix, allSessionPrefixes)
    ? "orchestrator"
    : "worker";
}

export function resolveAgentSelection(params: {
  role: SessionRole;
  project: ProjectConfig;
  defaults: DefaultPlugins;
  persistedAgent?: string;
  spawnAgentOverride?: string;
  prompt?: string;
  pickupAgentRole?: PromptRole;
  defaultPromptRole?: PromptRole;
}): ResolvedAgentSelection {
  const {
    role,
    project,
    defaults,
    persistedAgent,
    spawnAgentOverride,
    prompt,
    pickupAgentRole,
    defaultPromptRole,
  } = params;
  const roleProjectConfig = role === "orchestrator" ? project.orchestrator : project.worker;
  const roleDefaults = role === "orchestrator" ? defaults.orchestrator : defaults.worker;
  const sharedConfig = project.agentConfig ?? {};
  const roleAgentConfig = roleProjectConfig?.agentConfig ?? {};
  const promptRole =
    role === "worker"
      ? (pickupAgentRole ?? detectPromptRole(prompt) ?? defaultPromptRole)
      : undefined;
  const promptRoleConfig = promptRole ? sharedConfig.roleModels?.[promptRole] : undefined;

  const agentName = persistedAgent
    ? persistedAgent
    : role === "worker"
      ? (spawnAgentOverride ??
        roleProjectConfig?.agent ??
        project.agent ??
        roleDefaults?.agent ??
        defaults.agent)
      : (roleProjectConfig?.agent ?? project.agent ?? roleDefaults?.agent ?? defaults.agent);

  const agentConfig: AgentSpecificConfig = {
    ...sharedConfig,
  };
  for (const [key, value] of Object.entries(roleAgentConfig)) {
    if (value !== undefined) {
      agentConfig[key] = value;
    }
  }
  if (promptRoleConfig) {
    for (const [key, value] of Object.entries(promptRoleConfig)) {
      if (value !== undefined) {
        agentConfig[key] = value;
      }
    }
  }

  const model =
    role === "orchestrator"
      ? (roleAgentConfig.orchestratorModel ??
        roleAgentConfig.model ??
        sharedConfig.orchestratorModel ??
        sharedConfig.model)
      : (promptRoleConfig?.model ?? roleAgentConfig.model ?? sharedConfig.model);

  if (model !== undefined) {
    agentConfig.model = model;
  }

  const reasoningEffort =
    pickReasoningEffort(promptRoleConfig as AgentSpecificConfig | undefined) ??
    pickReasoningEffort(roleAgentConfig) ??
    pickReasoningEffort(sharedConfig);
  if (reasoningEffort !== undefined) {
    agentConfig.reasoningEffort = reasoningEffort;
  }

  const permissions = normalizeAgentPermissionMode(
    typeof agentConfig.permissions === "string" ? agentConfig.permissions : undefined,
  );
  if (permissions !== undefined) {
    agentConfig.permissions = permissions;
  }
  const subagent =
    typeof agentConfig["subagent"] === "string" ? agentConfig["subagent"] : undefined;

  return {
    role,
    agentName,
    agentConfig,
    model,
    reasoningEffort,
    permissions,
    subagent,
  };
}
