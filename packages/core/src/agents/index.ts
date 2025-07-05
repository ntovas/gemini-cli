/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Core agent types and interfaces
export * from './types.js';

// Agent implementations
export { MainAgent } from './mainAgent.js';
export { ToolsAgent } from './toolsAgent.js';

// Agent orchestration
export { AgentOrchestrator, AgentCommunicationBus } from './orchestrator.js';

// Integration layer
export {
  TwoAgentSystem,
  TwoAgentSystemConfig,
  createTwoAgentSystem,
  shouldEnableTwoAgentMode,
} from './integration.js';

// CLI Integration
export { AgentCliIntegration, createAgentCliIntegration } from './cliIntegration.js';

// Configuration
export * from './config.js';

// Prompts
export { getMainAgentSystemPrompt, getToolsAgentSystemPrompt } from './prompts.js';
