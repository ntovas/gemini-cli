/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockFetchWithTimeout = vi.hoisted(() => vi.fn());
const mockConvert = vi.hoisted(() => vi.fn());
const mockGetResponseText = vi.hoisted(() => vi.fn());

vi.mock('../utils/fetch.js', () => ({
  fetchWithTimeout: mockFetchWithTimeout,
}));

vi.mock('html-to-text', () => ({
  convert: mockConvert,
}));

vi.mock('../utils/generateContentResponseUtilities.js', () => ({
  getResponseText: mockGetResponseText,
}));

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { WebAnalyzerTool, WebAnalyzerToolParams } from './web-analyzer.js';
import { Config, ApprovalMode } from '../config/config.js';
import { GeminiClient } from '../core/client.js';

describe('WebAnalyzerTool', () => {
  let tool: WebAnalyzerTool;
  let mockConfig: Config;
  let mockGeminiClient: GeminiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockGeminiClient = {
      generateContent: vi.fn(),
    } as unknown as GeminiClient;
    
    mockConfig = {
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
      getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
      setApprovalMode: vi.fn(),
      getApiKey: () => 'test-api-key',
      getModel: () => 'test-model',
      getSandbox: () => false,
      getDebugMode: () => false,
      getQuestion: () => undefined,
      getFullContext: () => false,
      getToolDiscoveryCommand: () => undefined,
      getToolCallCommand: () => undefined,
      getMcpServerCommand: () => undefined,
      getMcpServers: () => undefined,
      getUserAgent: () => 'test-agent',
      getUserMemory: () => '',
      setUserMemory: vi.fn(),
      getGeminiMdFileCount: () => 0,
      setGeminiMdFileCount: vi.fn(),
      getToolRegistry: () => ({}) as any,
    } as unknown as Config;
    
    tool = new WebAnalyzerTool(mockConfig);
  });

  describe('constructor', () => {
    it('should create tool with correct properties', () => {
      expect(tool.name).toBe('web_analyzer');
      expect(tool.displayName).toBe('Web Analyzer');
      expect(tool.description).toContain('analyzing web content');
    });
  });

  describe('validateToolParams', () => {
    it('should return null for valid parameters', () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'http://example.com',
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid parameters with objective', () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'https://example.com',
        objective: 'find login forms',
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return error for invalid URL', () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'invalid-url',
      };
      const result = tool.validateToolParams(params);
      expect(result).toContain('valid URL starting with http');
    });

    it('should return error for empty URL', () => {
      const params: WebAnalyzerToolParams = {
        target_url: '',
      };
      const result = tool.validateToolParams(params);
      expect(result).toContain('valid URL starting with http');
    });

    it('should return error for URL not starting with http', () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'ftp://example.com',
      };
      const result = tool.validateToolParams(params);
      expect(result).toContain('valid URL starting with http');
    });
  });

  describe('getDescription', () => {
    it('should return description with URL only', () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'http://example.com',
      };
      const description = tool.getDescription(params);
      expect(description).toBe('Analyzing http://example.com');
    });

    it('should return description with URL and objective', () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'http://example.com',
        objective: 'find API endpoints',
      };
      const description = tool.getDescription(params);
      expect(description).toBe('Analyzing http://example.com for objective: "find API endpoints"');
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should return false for auto approval mode', async () => {
      (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.AUTO_EDIT);
      
      const params: WebAnalyzerToolParams = {
        target_url: 'http://example.com',
      };
      
      const result = await tool.shouldConfirmExecute(params);
      expect(result).toBe(false);
    });

    it('should return confirmation details for manual approval mode', async () => {
      (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.DEFAULT);
      
      const params: WebAnalyzerToolParams = {
        target_url: 'http://example.com',
      };
      
      const result = await tool.shouldConfirmExecute(params);
      expect(result).toBeTruthy();
      if (result) {
        expect(result.type).toBe('info');
        expect(result.title).toBe('Confirm Target Analysis');
        expect((result as any).urls).toEqual(['http://example.com']);
      }
    });

    it('should return false for invalid parameters', async () => {
      (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.DEFAULT);
      
      const params: WebAnalyzerToolParams = {
        target_url: 'invalid-url',
      };
      
      const result = await tool.shouldConfirmExecute(params);
      expect(result).toBe(false);
    });
  });

  describe('execute', () => {
    it('should return error for invalid parameters', async () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'invalid-url',
      };
      
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toContain('Error: Invalid parameters');
      expect(result.returnDisplay).toContain('Error:');
    });

    it('should successfully analyze HTML content', async () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'http://example.com',
        objective: 'find forms',
      };

      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('text/html'),
        },
        text: vi.fn().mockResolvedValue('<html><body><form></form></body></html>'),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);
      mockConvert.mockReturnValue('Converted HTML content');
      mockGetResponseText.mockReturnValue('Analysis result from LLM');
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({} as any);

      const result = await tool.execute(params, new AbortController().signal);

      expect(mockFetchWithTimeout).toHaveBeenCalledWith('http://example.com', 10000);
      expect(mockConvert).toHaveBeenCalledWith('<html><body><form></form></body></html>', expect.any(Object));
      expect(mockGeminiClient.generateContent).toHaveBeenCalled();
      expect(result.llmContent).toBe('Analysis result from LLM');
      expect(result.returnDisplay).toBe('Analysis for http://example.com complete.');
    });

    it('should successfully analyze JSON content', async () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'http://api.example.com/data',
      };

      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json'),
        },
        json: vi.fn().mockResolvedValue({ key: 'value' }),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);
      mockGetResponseText.mockReturnValue('JSON analysis result');
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({} as any);

      const result = await tool.execute(params, new AbortController().signal);

      expect(mockFetchWithTimeout).toHaveBeenCalledWith('http://api.example.com/data', 10000);
      expect(mockGeminiClient.generateContent).toHaveBeenCalled();
      expect(result.llmContent).toBe('JSON analysis result');
      expect(result.returnDisplay).toBe('Analysis for http://api.example.com/data complete.');
    });

    it('should successfully analyze plain text content', async () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'http://example.com/text',
      };

      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('text/plain'),
        },
        text: vi.fn().mockResolvedValue('Plain text content'),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);
      mockGetResponseText.mockReturnValue('Text analysis result');
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({} as any);

      const result = await tool.execute(params, new AbortController().signal);

      expect(mockFetchWithTimeout).toHaveBeenCalledWith('http://example.com/text', 10000);
      expect(mockGeminiClient.generateContent).toHaveBeenCalled();
      expect(result.llmContent).toBe('Text analysis result');
      expect(result.returnDisplay).toBe('Analysis for http://example.com/text complete.');
    });

    it('should handle fetch errors', async () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'http://example.com',
      };

      mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));

      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toContain('Error fetching content');
      expect(result.llmContent).toContain('Network error');
      expect(result.returnDisplay).toContain('Error:');
    });

    it('should handle HTTP error responses', async () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'http://example.com',
      };

      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);

      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toContain('Error fetching content');
      expect(result.llmContent).toContain('404 Not Found');
      expect(result.returnDisplay).toContain('Error:');
    });

    it('should handle LLM analysis errors', async () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'http://example.com',
      };

      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('text/html'),
        },
        text: vi.fn().mockResolvedValue('<html><body></body></html>'),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);
      mockConvert.mockReturnValue('Converted HTML content');
      (mockGeminiClient.generateContent as Mock).mockRejectedValue(new Error('LLM error'));

      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toContain('Error during LLM analysis');
      expect(result.llmContent).toContain('LLM error');
      expect(result.returnDisplay).toContain('Error:');
    });

    it('should handle empty LLM response', async () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'http://example.com',
      };

      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('text/html'),
        },
        text: vi.fn().mockResolvedValue('<html><body></body></html>'),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);
      mockConvert.mockReturnValue('Converted HTML content');
      mockGetResponseText.mockReturnValue('');
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({} as any);

      const result = await tool.execute(params, new AbortController().signal);

      expect(result.llmContent).toBe('No analysis returned from the model.');
      expect(result.returnDisplay).toBe('Analysis for http://example.com complete.');
    });

    it('should truncate large content', async () => {
      const params: WebAnalyzerToolParams = {
        target_url: 'http://example.com',
      };

      const largeContent = 'x'.repeat(200000); // Larger than MAX_CONTENT_LENGTH
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('text/plain'),
        },
        text: vi.fn().mockResolvedValue(largeContent),
      };

      mockFetchWithTimeout.mockResolvedValue(mockResponse as any);
      mockGetResponseText.mockReturnValue('Analysis result');
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({} as any);

      const result = await tool.execute(params, new AbortController().signal);

      expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
        expect.arrayContaining([{
          role: 'user',
          parts: [{
            text: expect.stringContaining('x'.repeat(100000).substring(0, 100000))
          }]
        }]),
        {},
        expect.any(AbortSignal)
      );
      expect(result.llmContent).toBe('Analysis result');
    });
  });
});
