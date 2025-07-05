/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_TOOL_MODEL } from '../config/models.js';

/**
 * Configuration for the two-agent system
 */
export interface TwoAgentConfig {
  enabled: boolean;
  mainAgent: {
    model: string;
    role: 'thinking' | 'planning' | 'communication';
    capabilities: string[];
  };
  toolsAgent: {
    model: string;
    role: 'execution' | 'tools' | 'operations';
    capabilities: string[];
  };
  communication: {
    protocol: 'a2a' | 'direct';
    debugging: boolean;
    messageHistory: boolean;
  };
}

/**
 * Default configuration for the two-agent system
 */
export const DEFAULT_TWO_AGENT_CONFIG: TwoAgentConfig = {
  enabled: true,
  mainAgent: {
    model: DEFAULT_GEMINI_MODEL,
    role: 'thinking',
    capabilities: [
      'user_interaction',
      'planning',
      'strategy',
      'analysis',
      'communication',
      'conversation_management',
    ],
  },
  toolsAgent: {
    model: DEFAULT_GEMINI_TOOL_MODEL,
    role: 'execution',
    capabilities: [
      'file_operations',
      'shell_commands',
      'tool_execution',
      'code_editing',
      'search_operations',
      'web_operations',
    ],
  },
  communication: {
    protocol: 'a2a',
    debugging: false,
    messageHistory: true,
  },
};

/**
 * Load two-agent configuration from environment and config
 */
export function loadTwoAgentConfig(config: Config): TwoAgentConfig {
  const baseConfig = { ...DEFAULT_TWO_AGENT_CONFIG };
  
  // Check if two-agent mode is enabled via environment
  const envEnabled = process.env.GEMINI_TWO_AGENT_MODE;
  if (envEnabled !== undefined) {
    baseConfig.enabled = ['true', '1', 'yes', 'on'].includes(envEnabled.toLowerCase());
  }

  // Check for custom models via environment
  const mainModel = process.env.GEMINI_MAIN_AGENT_MODEL;
  if (mainModel) {
    baseConfig.mainAgent.model = mainModel;
  }

  const toolModel = process.env.GEMINI_TOOL_AGENT_MODEL;
  if (toolModel) {
    baseConfig.toolsAgent.model = toolModel;
  }

  // Enable debugging if debug mode is on
  if (config.getDebugMode()) {
    baseConfig.communication.debugging = true;
  }

  return baseConfig;
}

/**
 * Validate two-agent configuration
 */
export function validateTwoAgentConfig(config: TwoAgentConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate models
  if (!config.mainAgent.model) {
    errors.push('Main agent model not specified');
  }

  if (!config.toolsAgent.model) {
    errors.push('Tools agent model not specified');
  }

  // Validate capabilities
  if (config.mainAgent.capabilities.length === 0) {
    errors.push('Main agent must have at least one capability');
  }

  if (config.toolsAgent.capabilities.length === 0) {
    errors.push('Tools agent must have at least one capability');
  }

  // Check for capability conflicts
  const mainCapabilities = new Set(config.mainAgent.capabilities);
  const toolCapabilities = new Set(config.toolsAgent.capabilities);
  
  // These capabilities should not overlap
  const conflictingCapabilities = [
    'tool_execution',
    'file_operations', 
    'shell_commands',
    'user_interaction',
  ];

  for (const capability of conflictingCapabilities) {
    if (mainCapabilities.has(capability) && toolCapabilities.has(capability)) {
      errors.push(`Capability '${capability}' should not be shared between agents`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Log two-agent configuration for debugging
 */
export function logTwoAgentConfig(config: TwoAgentConfig): void {
  console.log('=== Two-Agent System Configuration ===');
  console.log(`Enabled: ${config.enabled}`);
  console.log(`Main Agent Model: ${config.mainAgent.model}`);
  console.log(`Tools Agent Model: ${config.toolsAgent.model}`);
  console.log(`Communication Protocol: ${config.communication.protocol}`);
  console.log(`Debugging: ${config.communication.debugging}`);
  console.log(`Main Agent Capabilities: ${config.mainAgent.capabilities.join(', ')}`);
  console.log(`Tools Agent Capabilities: ${config.toolsAgent.capabilities.join(', ')}`);
  console.log('=====================================');
}
