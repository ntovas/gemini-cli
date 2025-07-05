/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Config } from '../config/config.js';
import { AgentCliIntegration, createAgentCliIntegration } from './cliIntegration.js';

// Mock the two-agent system
vi.mock('./integration.js', () => ({
  createTwoAgentSystem: vi.fn(),
}));

// Mock process.env
const originalEnv = process.env;

function createMockTwoAgentSystem(overrides: any = {}) {
  return {
    initialize: vi.fn(),
    isAgentSystemEnabled: vi.fn().mockReturnValue(true),
    handleUserInput: vi.fn().mockResolvedValue('Mock response'),
    shutdown: vi.fn(),
    getSystemStatus: vi.fn().mockReturnValue({}),
    getStats: vi.fn().mockReturnValue({}),
    // Add the required properties to satisfy TypeScript
    orchestrator: {} as any,
    isEnabled: true,
    config: {} as any,
    coreConfig: {} as any,
    ...overrides,
  } as any;
}

describe('AgentCliIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create integration instance', () => {
    const mockConfig = createMockConfig();
    const integration = createAgentCliIntegration(mockConfig);
    expect(integration).toBeInstanceOf(AgentCliIntegration);
  });

  it('should detect when two-agent mode is disabled', () => {
    process.env.GEMINI_TWO_AGENT_MODE = 'false';
    const mockConfig = createMockConfig();
    const integration = createAgentCliIntegration(mockConfig);
    
    expect(integration.shouldHandle()).toBe(false);
  });

  it('should detect when two-agent mode is enabled', () => {
    process.env.GEMINI_TWO_AGENT_MODE = 'true';
    const mockConfig = createMockConfig();
    const integration = createAgentCliIntegration(mockConfig);
    
    // Should be enabled but not ready until initialized
    expect(integration.shouldHandle()).toBe(false);
  });

  it('should initialize when two-agent mode is enabled', async () => {
    process.env.GEMINI_TWO_AGENT_MODE = 'true';
    const mockConfig = createMockConfig();
    
    const mockTwoAgentSystem = createMockTwoAgentSystem();
    
    const { createTwoAgentSystem } = await import('./integration.js');
    vi.mocked(createTwoAgentSystem).mockResolvedValue(mockTwoAgentSystem);
    
    const integration = createAgentCliIntegration(mockConfig);
    await integration.initialize();
    
    expect(createTwoAgentSystem).toHaveBeenCalledWith(mockConfig);
    expect(mockTwoAgentSystem.initialize).toHaveBeenCalled();
    expect(integration.shouldHandle()).toBe(true);
  });

  it('should process user input through agent system', async () => {
    process.env.GEMINI_TWO_AGENT_MODE = 'true';
    const mockConfig = createMockConfig();
    
    const mockTwoAgentSystem = createMockTwoAgentSystem({
      handleUserInput: vi.fn().mockResolvedValue('Agent response'),
    });
    
    const { createTwoAgentSystem } = await import('./integration.js');
    vi.mocked(createTwoAgentSystem).mockResolvedValue(mockTwoAgentSystem);
    
    const integration = createAgentCliIntegration(mockConfig);
    await integration.initialize();
    
    const result = await integration.processUserInput('Test input');
    
    expect(result).toBe('Agent response');
    expect(mockTwoAgentSystem.handleUserInput).toHaveBeenCalledWith('Test input');
  });

  it('should handle shutdown gracefully', async () => {
    process.env.GEMINI_TWO_AGENT_MODE = 'true';
    const mockConfig = createMockConfig();
    
    const mockTwoAgentSystem = createMockTwoAgentSystem();
    
    const { createTwoAgentSystem } = await import('./integration.js');
    vi.mocked(createTwoAgentSystem).mockResolvedValue(mockTwoAgentSystem);
    
    const integration = createAgentCliIntegration(mockConfig);
    await integration.initialize();
    await integration.shutdown();
    
    expect(mockTwoAgentSystem.shutdown).toHaveBeenCalled();
  });

  it('should provide system status', async () => {
    process.env.GEMINI_TWO_AGENT_MODE = 'true';
    const mockConfig = createMockConfig();
    
    const mockTwoAgentSystem = createMockTwoAgentSystem({
      getSystemStatus: vi.fn().mockReturnValue({ status: 'active' }),
    });
    
    const { createTwoAgentSystem } = await import('./integration.js');
    vi.mocked(createTwoAgentSystem).mockResolvedValue(mockTwoAgentSystem);
    
    const integration = createAgentCliIntegration(mockConfig);
    await integration.initialize();
    
    const status = integration.getStatus();
    
    expect(status).toEqual({
      enabled: true,
      ready: true,
      systemStatus: { status: 'active' },
    });
  });
});

function createMockConfig(): Config {
  return {
    isTwoAgentModeEnabled: vi.fn().mockReturnValue(process.env.GEMINI_TWO_AGENT_MODE === 'true'),
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
  } as any;
}
