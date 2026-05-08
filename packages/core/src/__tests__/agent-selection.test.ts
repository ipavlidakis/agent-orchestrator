import { describe, expect, it } from "vitest";
import {
  detectPickupAgentRole,
  resolveAgentSelection,
  type SessionRole,
} from "../agent-selection.js";
import type { DefaultPlugins, ProjectConfig } from "../types.js";

const defaults: DefaultPlugins = {
  runtime: "tmux",
  agent: "codex",
  workspace: "worktree",
  notifiers: [],
};

function makeProject(): ProjectConfig {
  return {
    name: "App",
    path: "/tmp/app",
    defaultBranch: "main",
    sessionPrefix: "app",
    agentConfig: {
      model: "openai/gpt-5.3-codex",
      reasoningEffort: "medium",
      roleModels: {
        planner: {
          model: "openai/gpt-5.5",
          reasoningEffort: "high",
        },
        worker: {
          model: "openai/gpt-5.4-mini",
          reasoningEffort: "minimal",
        },
        reviewer: {
          model: "openai/gpt-5.5",
          reasoningEffort: "high",
        },
      },
    },
    worker: {
      agentConfig: {
        model: "openai/gpt-5.3-codex",
        reasoningEffort: "low",
      },
    },
  };
}

function select(role: SessionRole, prompt?: string) {
  return resolveAgentSelection({
    role,
    project: makeProject(),
    defaults,
    prompt,
  });
}

function selectWithPickupRole(promptRole: "planner" | "worker" | "reviewer", prompt?: string) {
  return resolveAgentSelection({
    role: "worker",
    project: makeProject(),
    defaults,
    prompt,
    pickupAgentRole: promptRole,
  });
}

function selectWithDefaultRole(
  defaultPromptRole: "planner" | "worker" | "reviewer",
  prompt?: string,
) {
  return resolveAgentSelection({
    role: "worker",
    project: makeProject(),
    defaults,
    prompt,
    defaultPromptRole,
  });
}

describe("resolveAgentSelection role model overlay", () => {
  it("selects planner config for Role: Planner worker prompts", () => {
    const selection = select("worker", "Role: Planner\nPlan work");

    expect(selection.model).toBe("openai/gpt-5.5");
    expect(selection.reasoningEffort).toBe("high");
    expect(selection.agentConfig.model).toBe("openai/gpt-5.5");
  });

  it("selects reviewer config for Role: Reviewer worker prompts", () => {
    const selection = select("worker", "Role: Reviewer\nReview work");

    expect(selection.model).toBe("openai/gpt-5.5");
    expect(selection.reasoningEffort).toBe("high");
  });

  it("uses normal worker config when no prompt role is present", () => {
    const selection = select("worker", "Fix issue");

    expect(selection.model).toBe("openai/gpt-5.3-codex");
    expect(selection.reasoningEffort).toBe("low");
  });

  it("selects roleModels.worker for Role: Worker prompts", () => {
    const selection = select("worker", "Role: Worker\nImplement work");

    expect(selection.model).toBe("openai/gpt-5.4-mini");
    expect(selection.reasoningEffort).toBe("minimal");
  });

  it("detects pickup-agent role labels", () => {
    expect(detectPickupAgentRole(["bug", "pickup-agent:planner"])).toBe("planner");
    expect(detectPickupAgentRole(["pickup-agent:Reviewer"])).toBe("reviewer");
    expect(detectPickupAgentRole(["pickup-agent:designer"])).toBeUndefined();
  });

  it("lets pickup-agent labels select role model config", () => {
    const selection = selectWithPickupRole("reviewer");

    expect(selection.model).toBe("openai/gpt-5.5");
    expect(selection.reasoningEffort).toBe("high");
  });

  it("prefers pickup-agent labels over prompt role text", () => {
    const selection = selectWithPickupRole("planner", "Role: Worker\nImplement work");

    expect(selection.model).toBe("openai/gpt-5.5");
    expect(selection.reasoningEffort).toBe("high");
  });

  it("uses default role only when no pickup-agent label or prompt role exists", () => {
    const selection = selectWithDefaultRole("worker", "Fix issue");

    expect(selection.model).toBe("openai/gpt-5.4-mini");
    expect(selection.reasoningEffort).toBe("minimal");
  });

  it("prefers prompt role over default role", () => {
    const selection = selectWithDefaultRole("worker", "Role: Planner\nPlan work");

    expect(selection.model).toBe("openai/gpt-5.5");
    expect(selection.reasoningEffort).toBe("high");
  });
});
