/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Config } from '../config/config.js';
import { MainAgent } from './mainAgent.js';
import { ToolsAgent } from './toolsAgent.js';
import { AgentOrchestrator } from './orchestrator.js';
import { TwoAgentSystem, createTwoAgentSystem } from './integration.js';
import { AgentType, AgentMessageType } from './types.js';

// Mock the GeminiClient
const mockGeminiClientInstance = {
  initialize: vi.fn().mockResolvedValue(undefined),
  generateContent: vi.fn().mockResolvedValue({
    candidates: [
      {
        content: {
          parts: [{ text: 'Mocked response from agent' }],
        },
      },
    ],
  }),
};

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn(() => mockGeminiClientInstance),
}));

// Mock the CoreToolScheduler
vi.mock('../core/coreToolScheduler.js', () => ({
  CoreToolScheduler: vi.fn().mockImplementation(() => ({
    schedule: vi.fn().mockResolvedValue(undefined),
  })),
  convertToFunctionResponse: vi.fn().mockReturnValue({
    functionResponse: {
      id: 'test-call',
      name: 'test-tool',
      response: { output: 'test output' },
    },
  }),
}));

describe('Two-Agent System', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = {
      getSessionId: () => 'test-session',
      getDebugMode: () => true,
      getModel: () => 'gemini-2.5-pro',
      getContentGeneratorConfig: () => ({
        model: 'gemini-2.5-pro',
        authType: 'oauth-personal',
      }),
      getToolRegistry: () =>
        Promise.resolve({
          getTool: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue({
              llmContent: 'test result',
              returnDisplay: 'Tool executed successfully',
            }),
          }),
        }),
    } as unknown as Config;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MainAgent', () => {
    it('should initialize correctly', async () => {
      const mainAgent = new MainAgent(mockConfig);
      
      await mainAgent.initialize({
        sessionId: 'test-session',
        conversationHistory: [],
        metadata: {},
      });

      expect(mainAgent.type).toBe(AgentType.MAIN);
      expect(mainAgent.role.name).toBe('Main Planning Agent');
    });

    it('should have correct capabilities and restrictions', () => {
      const mainAgent = new MainAgent(mockConfig);
      
      expect(mainAgent.role.capabilities).toContain('User interaction');
      expect(mainAgent.role.capabilities).toContain('Planning and strategy');
      expect(mainAgent.role.restrictions).toContain('Cannot execute tools directly');
    });
  });

  describe('ToolsAgent', () => {
    it('should initialize correctly', async () => {
      const toolsAgent = new ToolsAgent(mockConfig);
      
      await toolsAgent.initialize({
        sessionId: 'test-session',
        conversationHistory: [],
        metadata: {},
      });

      expect(toolsAgent.type).toBe(AgentType.TOOLS);
      expect(toolsAgent.role.name).toBe('Tools Execution Agent');
    });

    it('should have correct capabilities and restrictions', () => {
      const toolsAgent = new ToolsAgent(mockConfig);
      
      expect(toolsAgent.role.capabilities).toContain('File system operations');
      expect(toolsAgent.role.capabilities).toContain('Tool orchestration');
      expect(toolsAgent.role.restrictions).toContain('Limited reasoning capabilities');
    });
  });

  describe('AgentOrchestrator', () => {
    it('should initialize both agents', async () => {
      const orchestrator = new AgentOrchestrator(mockConfig);
      
      await orchestrator.initialize('test-session');
      
      expect(orchestrator.getMainAgent().type).toBe(AgentType.MAIN);
      expect(orchestrator.getToolsAgent().type).toBe(AgentType.TOOLS);
    });

    it('should provide communication statistics', async () => {
      const orchestrator = new AgentOrchestrator(mockConfig);
      await orchestrator.initialize('test-session');
      
      const stats = orchestrator.getCommunicationStats();
      
      expect(stats).toHaveProperty('mainAgentMessages');
      expect(stats).toHaveProperty('toolsAgentMessages');
      expect(stats).toHaveProperty('totalMessages');
    });
  });

  describe('TwoAgentSystem', () => {
    it('should create and initialize successfully', async () => {
      const twoAgentSystem = await createTwoAgentSystem(mockConfig, {
        enabled: true,
        sessionId: 'test-session',
      });
      
      expect(twoAgentSystem.isAgentSystemEnabled()).toBe(true);
      
      const status = twoAgentSystem.getSystemStatus();
      expect(status.enabled).toBe(true);
      expect(status.status).toBe('active');
      
      await twoAgentSystem.shutdown();
    });

    it('should handle user input', async () => {
      const twoAgentSystem = await createTwoAgentSystem(mockConfig, {
        enabled: true,
        sessionId: 'test-session',
      });
      
      await twoAgentSystem.initialize();
      
      const response = await twoAgentSystem.handleUserInput('Hello, test message');
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
      
      await twoAgentSystem.shutdown();
    });

    it('should provide communication stats', async () => {
      const twoAgentSystem = await createTwoAgentSystem(mockConfig, {
        enabled: true,
        sessionId: 'test-session',
      });
      
      const stats = twoAgentSystem.getStats();
      
      expect(stats).toHaveProperty('mainAgentMessages');
      expect(stats).toHaveProperty('toolsAgentMessages');
      expect(stats).toHaveProperty('totalMessages');
      
      await twoAgentSystem.shutdown();
    });
  });

  describe('Agent Communication', () => {
    it('should create messages with correct structure', () => {
      const message = {
        id: 'test-message',
        type: AgentMessageType.STATUS_UPDATE,
        fromAgent: AgentType.MAIN,
        toAgent: AgentType.TOOLS,
        timestamp: Date.now(),
        content: 'Test message',
        status: 'testing',
      };

      expect(message.type).toBe(AgentMessageType.STATUS_UPDATE);
      expect(message.fromAgent).toBe(AgentType.MAIN);
      expect(message.toAgent).toBe(AgentType.TOOLS);
    });
  });
});
