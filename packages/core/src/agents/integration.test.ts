/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Config } from '../config/config.js';
import { MainAgent } from './mainAgent.js';
import { ToolsAgent } from './toolsAgent.js';
import { AgentOrchestrator } from './orchestrator.js';
import { 
  AgentContext, 
  AgentType, 
  AgentMessageType, 
  PlanningRequest,
  ToolExecutionRequest,
  ToolExecutionResponse,
  StatusUpdate 
} from './types.js';

// Mock the GeminiClient
vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    generateContent: vi.fn(),
    getChat: vi.fn(),
  })),
}));

// Mock the CoreToolScheduler
vi.mock('../core/coreToolScheduler.js', () => ({
  CoreToolScheduler: vi.fn().mockImplementation(() => ({
    schedule: vi.fn(),
  })),
  convertToFunctionResponse: vi.fn(),
}));

describe('Two-Agent System Integration', () => {
  let mockConfig: Config;
  let context: AgentContext;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = createMockConfig();
    context = {
      sessionId: 'test-session',
      conversationHistory: [],
      metadata: {},
    };
  });

  it('should create main agent and tools agent', () => {
    const mainAgent = new MainAgent(mockConfig);
    const toolsAgent = new ToolsAgent(mockConfig);
    
    expect(mainAgent.type).toBe(AgentType.MAIN);
    expect(toolsAgent.type).toBe(AgentType.TOOLS);
  });

  it('should initialize agents successfully', async () => {
    const mainAgent = new MainAgent(mockConfig);
    const toolsAgent = new ToolsAgent(mockConfig);
    
    await mainAgent.initialize(context);
    await toolsAgent.initialize(context);
    
    expect(mainAgent.role.name).toBe('Main Planning Agent');
    expect(toolsAgent.role.name).toBe('Tools Execution Agent');
  });

  it('should create agent orchestrator', () => {
    const orchestrator = new AgentOrchestrator(mockConfig);
    expect(orchestrator).toBeDefined();
  });

  it('should process planning requests', async () => {
    const mainAgent = new MainAgent(mockConfig);
    await mainAgent.initialize(context);
    
    const planningRequest: PlanningRequest = {
      id: 'test-request',
      type: AgentMessageType.PLANNING_REQUEST,
      fromAgent: AgentType.TOOLS,
      toAgent: AgentType.MAIN,
      timestamp: Date.now(),
      content: 'Planning request content',
      situation: 'User wants to test the system',
      availableTools: ['ReadFileTool', 'WriteFileTool'],
      context: [],
    };
    
    // Mock the internal method to avoid actual API calls
    const mockResponse = {
      id: 'test-response',
      type: AgentMessageType.PLANNING_RESPONSE,
      fromAgent: AgentType.MAIN,
      toAgent: AgentType.TOOLS,
      timestamp: Date.now(),
      response: 'Mock planning response',
      needsTools: false,
    };
    
    vi.spyOn(mainAgent as any, 'handlePlanningRequest').mockResolvedValue(mockResponse);
    
    const result = await mainAgent.processMessage(planningRequest);
    expect(result).toBeDefined();
    expect(result?.type).toBe(AgentMessageType.PLANNING_RESPONSE);
  });

  it('should process tool execution requests', async () => {
    const toolsAgent = new ToolsAgent(mockConfig);
    await toolsAgent.initialize(context);
    
    const toolRequest: ToolExecutionRequest = {
      id: 'test-tool-request',
      type: AgentMessageType.TOOL_EXECUTION_REQUEST,
      fromAgent: AgentType.MAIN,
      toAgent: AgentType.TOOLS,
      timestamp: Date.now(),
      content: 'Execute read file tool',
      toolCalls: [
        {
          callId: 'test-call-1',
          name: 'ReadFileTool',
          args: { filePath: '/test/file.txt' },
          isClientInitiated: false,
        }
      ],
      context: [],
    };
    
    // Mock the internal method to avoid actual tool execution
    const mockResponse: ToolExecutionResponse = {
      id: 'test-tool-response',
      type: AgentMessageType.TOOL_EXECUTION_RESPONSE,
      fromAgent: AgentType.TOOLS,
      toAgent: AgentType.MAIN,
      timestamp: Date.now(),
      content: 'Tool execution completed',
      success: true,
      toolResults: [],
    };
    
    vi.spyOn(toolsAgent as any, 'handleToolExecutionRequest').mockResolvedValue(mockResponse);
    
    const result = await toolsAgent.processMessage(toolRequest);
    expect(result).toBeDefined();
    expect(result?.type).toBe(AgentMessageType.TOOL_EXECUTION_RESPONSE);
  });

  it('should handle status updates', async () => {
    const mainAgent = new MainAgent(mockConfig);
    await mainAgent.initialize(context);
    
    const statusUpdate: StatusUpdate = {
      id: 'test-status',
      type: AgentMessageType.STATUS_UPDATE,
      fromAgent: AgentType.TOOLS,
      toAgent: AgentType.MAIN,
      timestamp: Date.now(),
      content: 'Tool execution started',
      status: 'in_progress',
    };
    
    const result = await mainAgent.processMessage(statusUpdate);
    expect(result).toBeNull(); // Status updates typically don't require responses
  });

  it('should validate agent roles and capabilities', () => {
    const mainAgent = new MainAgent(mockConfig);
    const toolsAgent = new ToolsAgent(mockConfig);
    
    // Main agent should have planning capabilities but no tools
    expect(mainAgent.role.capabilities).toContain('Planning and strategy');
    expect(mainAgent.role.capabilities).toContain('User interaction');
    expect(mainAgent.role.restrictions).toContain('Cannot execute tools directly');
    
    // Tools agent should have tool execution capabilities
    expect(toolsAgent.role.capabilities).toContain('File system operations');
    expect(toolsAgent.role.capabilities).toContain('Shell command execution');
    expect(toolsAgent.role.restrictions).toContain('Limited reasoning capabilities');
  });

  it('should shutdown agents gracefully', async () => {
    const mainAgent = new MainAgent(mockConfig);
    const toolsAgent = new ToolsAgent(mockConfig);
    
    await mainAgent.initialize(context);
    await toolsAgent.initialize(context);
    
    await mainAgent.shutdown();
    await toolsAgent.shutdown();
    
    // Should not throw any errors
    expect(true).toBe(true);
  });
});

function createMockConfig(): Config {
  return {
    getSessionId: vi.fn().mockReturnValue('test-session'),
    getTargetDir: vi.fn().mockReturnValue('/test/dir'),
    getDebugMode: vi.fn().mockReturnValue(false),
    getModel: vi.fn().mockReturnValue('gemini-1.5-flash'),
    getContentGeneratorConfig: vi.fn().mockReturnValue({
      authType: 'gemini',
      apiKey: 'test-key',
    }),
    getToolRegistry: vi.fn().mockResolvedValue({
      getFunctionDeclarations: vi.fn().mockReturnValue([]),
    }),
    getUserMemory: vi.fn().mockReturnValue(''),
    isTwoAgentModeEnabled: vi.fn().mockReturnValue(true),
  } as any;
}
