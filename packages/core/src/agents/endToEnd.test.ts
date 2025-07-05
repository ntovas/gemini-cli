/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Config } from '../config/config.js';
import { AgentCliIntegration, createAgentCliIntegration } from './cliIntegration.js';
import { TwoAgentSystem } from './integration.js';
import { AgentOrchestrator } from './orchestrator.js';
import { MainAgent } from './mainAgent.js';
import { ToolsAgent } from './toolsAgent.js';

// Mock all the dependencies
const mockGeminiClientInstance = {
  initialize: vi.fn().mockResolvedValue(undefined),
  generateContent: vi.fn().mockResolvedValue({
    candidates: [
      {
        content: {
          parts: [{ text: 'Mocked LLM response' }],
        },
      },
    ],
  }),
};

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn(() => mockGeminiClientInstance),
}));

vi.mock('../core/coreToolScheduler.js', () => ({
  CoreToolScheduler: vi.fn(() => ({
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

// Mock environment
const originalEnv = process.env;

describe('Two-Agent System End-to-End Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    
    // Reset all mocks to ensure fresh instances
    mockGeminiClientInstance.initialize.mockClear();
    mockGeminiClientInstance.generateContent.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    // Reset any global state that might persist between tests
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should work end-to-end when two-agent mode is enabled', async () => {
    // Enable two-agent mode
    process.env.GEMINI_TWO_AGENT_MODE = 'true';
    
    // Create a mock config
    const mockConfig = createMockConfig();
    
    // Create and initialize the CLI integration
    const integration = createAgentCliIntegration(mockConfig);
    
    try {
      await integration.initialize();
      
      // Verify the system is ready
      expect(integration.shouldHandle()).toBe(true);
      expect(integration.isAgentSystemReady()).toBe(true);
      
      // Test processing user input
      const userInput = 'Read the README.md file and tell me about the project';
      const response = await integration.processUserInput(userInput);
      
      // Should get a response from the agent system
      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
      
      // Verify system status
      const status = integration.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.ready).toBe(true);
      expect(status.systemStatus).toBeDefined();
    } finally {
      // Always cleanup
      await integration.shutdown();
    }
  });

  it('should demonstrate agent communication flow', async () => {
    process.env.GEMINI_TWO_AGENT_MODE = 'true';
    const mockConfig = createMockConfig();
    
    // Create the two-agent system directly
    const twoAgentSystem = new TwoAgentSystem(mockConfig, {
      enabled: true,
      sessionId: 'test-session',
      debugMode: true,
    });
    
    await twoAgentSystem.initialize();
    
    // Simulate a user request that requires tool execution
    const userInput = 'Create a new file called test.txt with the content "Hello World"';
    
    // This should trigger:
    // 1. User input goes to Main Agent for planning
    // 2. Main Agent decides tools are needed
    // 3. Tools Agent receives tool execution request
    // 4. Tools Agent executes WriteFileTool
    // 5. Response flows back to Main Agent
    // 6. Main Agent generates final response
    const response = await twoAgentSystem.handleUserInput(userInput);
    
    expect(response).toBeDefined();
    expect(typeof response).toBe('string');
    
    await twoAgentSystem.shutdown();
  });

  it('should handle agent communication patterns', async () => {
    const mockConfig = createMockConfig();
    
    // Create individual agents
    const mainAgent = new MainAgent(mockConfig);
    const toolsAgent = new ToolsAgent(mockConfig);
    
    // Initialize agents
    const context = {
      sessionId: 'test-session',
      conversationHistory: [],
      metadata: {},
    };
    
    await mainAgent.initialize(context);
    await toolsAgent.initialize(context);
    
    // Verify agent types and roles
    expect(mainAgent.type).toBe('main');
    expect(toolsAgent.type).toBe('tools');
    
    expect(mainAgent.role.name).toBe('Main Planning Agent');
    expect(toolsAgent.role.name).toBe('Tools Execution Agent');
    
    // Verify capabilities are complementary
    expect(mainAgent.role.capabilities).toContain('Planning and strategy');
    expect(mainAgent.role.capabilities).toContain('User interaction');
    expect(mainAgent.role.restrictions).toContain('Cannot execute tools directly');
    
    expect(toolsAgent.role.capabilities).toContain('File system operations');
    expect(toolsAgent.role.capabilities).toContain('Tool orchestration');
    expect(toolsAgent.role.restrictions).toContain('Limited reasoning capabilities');
    
    // Cleanup
    await mainAgent.shutdown();
    await toolsAgent.shutdown();
  });

  it('should provide proper error handling when disabled', async () => {
    process.env.GEMINI_TWO_AGENT_MODE = 'false';
    const mockConfig = createMockConfig();
    
    const integration = createAgentCliIntegration(mockConfig);
    await integration.initialize();
    
    // Should not be ready when disabled
    expect(integration.shouldHandle()).toBe(false);
    
    // Should throw error when trying to process input
    await expect(integration.processUserInput('test input')).rejects.toThrow(
      'Agent system not ready, fallback to regular processing'
    );
  });

  it('should support graceful fallback patterns', async () => {
    const mockConfig = createMockConfig();
    
    // Test various configuration scenarios
    const scenarios = [
      { env: 'false', expected: false },
      { env: '0', expected: false },
      { env: 'true', expected: true },
      { env: '1', expected: true },
      { env: undefined, expected: false },
    ];
    
    for (const scenario of scenarios) {
      if (scenario.env === undefined) {
        delete process.env.GEMINI_TWO_AGENT_MODE;
      } else {
        process.env.GEMINI_TWO_AGENT_MODE = scenario.env;
      }
      
      const integration = createAgentCliIntegration(mockConfig);
      expect(mockConfig.isTwoAgentModeEnabled()).toBe(scenario.expected);
    }
  });  it('should demonstrate workflow orchestration', async () => {
    process.env.GEMINI_TWO_AGENT_MODE = 'true';
    const mockConfig = createMockConfig();
    
    // Create orchestrator
    const orchestrator = new AgentOrchestrator(mockConfig);
    
    try {
      const context = {
        sessionId: 'test-session',
        conversationHistory: [],
        metadata: {},
      };

      await orchestrator.initialize('test-session');
      
      // Verify both agents are available
      const mainAgent = orchestrator.getMainAgent();
      const toolsAgent = orchestrator.getToolsAgent();
      
      expect(mainAgent).toBeDefined();
      expect(toolsAgent).toBeDefined();
      expect(mainAgent.type).toBe('main');
      expect(toolsAgent.type).toBe('tools');
      
      // Test orchestrator capabilities
      expect(orchestrator).toBeDefined();
      
      const stats = orchestrator.getCommunicationStats();
      expect(stats).toHaveProperty('messagesSent');
      expect(stats).toHaveProperty('messagesReceived');
      expect(stats).toHaveProperty('activeAgents');
      
      // Verify stats content
      expect(stats.activeAgents).toBe(2);
      expect(stats.messagesSent).toBe(0);
      expect(stats.messagesReceived).toBe(0);
    } finally {
      await orchestrator.shutdown();
    }
  });
});

function createMockConfig(): Config {
  return {
    isTwoAgentModeEnabled: vi.fn().mockImplementation(() => 
      process.env.GEMINI_TWO_AGENT_MODE === 'true' || 
      process.env.GEMINI_TWO_AGENT_MODE === '1'
    ),
    getSessionId: vi.fn().mockReturnValue('test-session'),
    getTargetDir: vi.fn().mockReturnValue('/test/dir'),
    getDebugMode: vi.fn().mockReturnValue(false),
    getModel: vi.fn().mockReturnValue('gemini-1.5-flash'),
    getContentGeneratorConfig: vi.fn().mockReturnValue({
      authType: 'gemini',
      apiKey: 'test-key',
    }),
    getToolRegistry: vi.fn().mockResolvedValue({
      getFunctionDeclarations: vi.fn().mockReturnValue([
        { name: 'ReadFileTool' },
        { name: 'WriteFileTool' },
        { name: 'EditTool' },
      ]),
    }),
    getUserMemory: vi.fn().mockReturnValue(''),
  } as any;
}
