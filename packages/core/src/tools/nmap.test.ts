/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NmapTool, NmapToolParams } from './nmap.js';
import { Config } from '../config/config.js';
import { ToolConfirmationOutcome } from './tools.js';

// Mock dependencies
vi.mock('child_process');
vi.mock('strip-ansi', () => ({
  default: (str: string) => str,
}));

// Mock config
const mockConfig = {
  getTargetDir: () => '/test/dir',
} as unknown as Config;

describe('NmapTool', () => {
  let tool: NmapTool;

  beforeEach(() => {
    tool = new NmapTool(mockConfig);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(tool.name).toBe('nmap_scan');
      expect(tool.displayName).toBe('Network Scanner');
      expect(tool.description).toContain('Advanced network reconnaissance tool');
    });
  });

  describe('validateToolParams', () => {
    it('should validate valid parameters', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'quick',
      };
      
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should reject empty target', () => {
      const params: NmapToolParams = {
        target: '',
        scan_type: 'quick',
      };
      
      expect(tool.validateToolParams(params)).toBe('Target cannot be empty.');
    });

    it('should reject invalid target format', () => {
      const params: NmapToolParams = {
        target: 'invalid..target',
        scan_type: 'quick',
      };
      
      expect(tool.validateToolParams(params)).toBe('Invalid target format. Use IP address, hostname, or CIDR range.');
    });

    it('should validate valid IP addresses', () => {
      const validTargets = [
        '192.168.1.1',
        '10.0.0.0/24',
        '172.16.1.100',
        '192.168.1.0/16',
      ];

      validTargets.forEach(target => {
        const params: NmapToolParams = { target, scan_type: 'quick' };
        expect(tool.validateToolParams(params)).toBeNull();
      });
    });

    it('should validate valid hostnames', () => {
      const validTargets = [
        'example.com',
        'test.example.org',
        'host123',
        'my-host.local',
      ];

      validTargets.forEach(target => {
        const params: NmapToolParams = { target, scan_type: 'quick' };
        expect(tool.validateToolParams(params)).toBeNull();
      });
    });

    it('should validate port specifications', () => {
      const validPorts = [
        '80',
        '22,80,443',
        '1-1000',
        '80,443,8000-8080',
        'top-ports 1000',
      ];

      validPorts.forEach(ports => {
        const params: NmapToolParams = {
          target: '10.10.10.1',
          scan_type: 'quick',
          ports,
        };
        expect(tool.validateToolParams(params)).toBeNull();
      });
    });

    it('should reject invalid port specifications', () => {
      const invalidPorts = [
        'invalid',
        '80,,443',
        '1-',
        '-1000',
        'top-ports',
      ];

      invalidPorts.forEach(ports => {
        const params: NmapToolParams = {
          target: '10.10.10.1',
          scan_type: 'quick',
          ports,
        };
        expect(tool.validateToolParams(params)).toBe('Invalid ports format. Use comma-separated ports, ranges, or "top-ports N".');
      });
    });

    it('should require custom_flags for custom scan type', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'custom',
      };
      
      expect(tool.validateToolParams(params)).toBe('Custom scan type requires custom_flags parameter.');
    });

    it('should suggest scripts for script scan type', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'script',
      };
      
      expect(tool.validateToolParams(params)).toBe('Script scan type should specify scripts parameter.');
    });
  });

  describe('getDescription', () => {
    it('should generate basic description', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'quick',
      };
      
      const description = tool.getDescription(params);
      expect(description).toBe('nmap quick scan of 10.10.10.1');
    });

    it('should include ports in description', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'quick',
        ports: '22,80,443',
      };
      
      const description = tool.getDescription(params);
      expect(description).toBe('nmap quick scan of 10.10.10.1 (ports: 22,80,443)');
    });

    it('should include scripts in description', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'script',
        scripts: 'vuln',
      };
      
      const description = tool.getDescription(params);
      expect(description).toBe('nmap script scan of 10.10.10.1 (scripts: vuln)');
    });

    it('should include custom description', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'quick',
        description: 'Initial recon',
      };
      
      const description = tool.getDescription(params);
      expect(description).toBe('nmap quick scan of 10.10.10.1 - Initial recon');
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should always require confirmation for nmap scans', async () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'quick',
      };
      
      const abortSignal = new AbortController().signal;
      const confirmation = await tool.shouldConfirmExecute(params, abortSignal);
      
      expect(confirmation).not.toBe(false);
      expect(confirmation).toMatchObject({
        type: 'exec',
        title: 'Confirm Nmap Network Scan',
        rootCommand: 'nmap',
      });
    });

    it('should skip confirmation for invalid parameters', async () => {
      const params: NmapToolParams = {
        target: '',
        scan_type: 'quick',
      };
      
      const abortSignal = new AbortController().signal;
      const confirmation = await tool.shouldConfirmExecute(params, abortSignal);
      
      expect(confirmation).toBe(false);
    });

    it('should include sudo in command for privileged scans', async () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'comprehensive', // requires sudo
      };
      
      const abortSignal = new AbortController().signal;
      const confirmation = await tool.shouldConfirmExecute(params, abortSignal);
      
      expect(confirmation).not.toBe(false);
      if (confirmation !== false && confirmation.type === 'exec') {
        expect(confirmation.command).toContain('sudo');
      }
    });
  });

  describe('scan type configurations', () => {
    it('should configure quick scan correctly', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'quick',
      };
      
      // Access the private method through any cast for testing
      const command = (tool as any).buildNmapCommand(params);
      
      expect(command).toContain('nmap');
      expect(command).toContain('-sS');
      expect(command).toContain('-F');
      expect(command).toContain('10.10.10.1');
    });

    it('should configure comprehensive scan correctly', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'comprehensive',
      };
      
      const command = (tool as any).buildNmapCommand(params);
      
      expect(command).toContain('-sS');
      expect(command).toContain('-sV');
      expect(command).toContain('-O');
      expect(command).toContain('-A');
      expect(command).toContain('-p-');
    });

    it('should configure stealth scan correctly', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'stealth',
      };
      
      const command = (tool as any).buildNmapCommand(params);
      
      expect(command).toContain('-sS');
      expect(command).toContain('-f');
      expect(command).toContain('-D');
      expect(command).toContain('RND:10');
      expect(command).toContain('-T1');
    });

    it('should configure UDP scan correctly', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'udp',
      };
      
      const command = (tool as any).buildNmapCommand(params);
      
      expect(command).toContain('-sU');
    });

    it('should configure vulnerability scan correctly', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'vuln',
      };
      
      const command = (tool as any).buildNmapCommand(params);
      
      expect(command).toContain('-sS');
      expect(command).toContain('-sV');
      expect(command).toContain('--script');
    });

    it('should use custom timing template', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'quick',
        timing: '4',
      };
      
      const command = (tool as any).buildNmapCommand(params);
      
      expect(command).toContain('-T4');
    });

    it('should use custom ports', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'quick',
        ports: '22,80,443',
      };
      
      const command = (tool as any).buildNmapCommand(params);
      
      expect(command).toContain('-p');
      expect(command).toContain('22,80,443');
    });

    it('should use custom scripts', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'script',
        scripts: 'http-*',
      };
      
      const command = (tool as any).buildNmapCommand(params);
      
      expect(command).toContain('--script');
      expect(command).toContain('http-*');
    });

    it('should handle custom flags', () => {
      const params: NmapToolParams = {
        target: '10.10.10.1',
        scan_type: 'custom',
        custom_flags: '-sS -sV --version-intensity 9',
      };
      
      const command = (tool as any).buildNmapCommand(params);
      
      expect(command).toContain('-sS');
      expect(command).toContain('-sV');
      expect(command).toContain('--version-intensity');
      expect(command).toContain('9');
    });
  });
});
