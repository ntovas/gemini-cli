/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { spawn } from 'child_process';
import stripAnsi from 'strip-ansi';

export interface HTBScannerParams {
  scanType: 'nmap' | 'gobuster' | 'sqlmap' | 'hashcat' | 'enum4linux' | 'hydra';
  target?: string;
  options?: string;
  wordlist?: string;
  hashFile?: string;
  description?: string;
}

export class HTBScannerTool extends BaseTool<HTBScannerParams, ToolResult> {
  static Name: string = 'htb_scanner';
  private whitelist: Set<string> = new Set();

  constructor(private readonly config: Config) {
    super(
      HTBScannerTool.Name,
      'HTB Scanner',
      `Specialized tool for Hack The Box challenge scanning and enumeration. Supports common HTB tools:

- **nmap**: Network port scanning and service enumeration
- **gobuster**: Directory and file enumeration on web servers
- **sqlmap**: Automated SQL injection testing
- **hashcat**: Password hash cracking
- **enum4linux**: SMB/Samba enumeration
- **hydra**: Login brute-forcing

This tool provides a simplified interface to these security testing tools with HTB-optimized defaults.`,
      {
        type: 'object',
        properties: {
          scanType: {
            type: 'string',
            enum: ['nmap', 'gobuster', 'sqlmap', 'hashcat', 'enum4linux', 'hydra'],
            description: 'Type of scan to perform',
          },
          target: {
            type: 'string',
            description: 'Target IP address, URL, or hostname',
          },
          options: {
            type: 'string',
            description: 'Additional command-line options for the tool',
          },
          wordlist: {
            type: 'string',
            description: 'Path to wordlist file (for gobuster, hydra)',
          },
          hashFile: {
            type: 'string',
            description: 'Path to hash file (for hashcat)',
          },
          description: {
            type: 'string',
            description: 'Brief description of the scan purpose',
          },
        },
        required: ['scanType'],
      },
      false, // output is not markdown
      true, // output can be updated
    );
  }

  getDescription(params: HTBScannerParams): string {
    let description = `HTB ${params.scanType} scan`;
    if (params.target) {
      description += ` on ${params.target}`;
    }
    if (params.description) {
      description += ` (${params.description})`;
    }
    return description;
  }

  private buildCommand(params: HTBScannerParams): string {
    const { scanType, target, options, wordlist, hashFile } = params;

    switch (scanType) {
      case 'nmap':
        return `nmap -sV -sC ${options || ''} ${target || ''}`.trim();
      
      case 'gobuster':
        const gobusterWordlist = wordlist || '/usr/share/wordlists/dirb/common.txt';
        return `gobuster dir -u ${target || ''} -w ${gobusterWordlist} ${options || ''}`.trim();
      
      case 'sqlmap':
        return `sqlmap -u ${target || ''} ${options || '--batch --dump'}`.trim();
      
      case 'hashcat':
        const hashcatWordlist = wordlist || '/usr/share/wordlists/rockyou.txt';
        return `hashcat ${options || '-m 0'} ${hashFile || ''} ${hashcatWordlist}`.trim();
      
      case 'enum4linux':
        return `enum4linux ${options || '-a'} ${target || ''}`.trim();
      
      case 'hydra':
        return `hydra ${options || ''} ${target || ''}`.trim();
      
      default:
        throw new Error(`Unknown scan type: ${scanType}`);
    }
  }

  validateToolParams(params: HTBScannerParams): string | null {
    if (!SchemaValidator.validate(this.parameterSchema as Record<string, unknown>, params)) {
      return 'Parameters failed schema validation.';
    }

    // Validate required parameters based on scan type
    switch (params.scanType) {
      case 'nmap':
      case 'gobuster':
      case 'sqlmap':
      case 'enum4linux':
        if (!params.target) {
          return `Target is required for ${params.scanType} scan.`;
        }
        break;
      
      case 'hashcat':
        if (!params.hashFile) {
          return 'Hash file is required for hashcat.';
        }
        break;
      
      case 'hydra':
        if (!params.target && !params.options) {
          return 'Either target or options must be specified for hydra.';
        }
        break;
    }

    return null;
  }

  async shouldConfirmExecute(
    params: HTBScannerParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.validateToolParams(params)) {
      return false; // skip confirmation, execute call will fail immediately
    }
    
    if (this.whitelist.has(params.scanType)) {
      return false; // already approved and whitelisted
    }

    return {
      type: 'exec',
      title: `Confirm HTB ${params.scanType} Scan`,
      command: this.buildCommand(params),
      rootCommand: params.scanType,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.whitelist.add(params.scanType);
        }
      },
    };
  }

  async execute(
    params: HTBScannerParams,
    abortSignal: AbortSignal,
    updateOutput?: (chunk: string) => void,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `HTB scan rejected: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    if (abortSignal.aborted) {
      return {
        llmContent: 'HTB scan was cancelled by user before it could start.',
        returnDisplay: 'Scan cancelled by user.',
      };
    }

    const command = this.buildCommand(params);
    const shell = spawn('bash', ['-c', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: this.config.getTargetDir(),
    });

    let exited = false;
    let stdout = '';
    let stderr = '';
    let lastUpdateTime = Date.now();

    const OUTPUT_UPDATE_INTERVAL_MS = 1000;

    const appendOutput = (str: string) => {
      if (updateOutput && Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
        updateOutput(stdout + stderr);
        lastUpdateTime = Date.now();
      }
    };

    shell.stdout.on('data', (data: Buffer) => {
      if (!exited) {
        const str = stripAnsi(data.toString());
        stdout += str;
        appendOutput(str);
      }
    });

    shell.stderr.on('data', (data: Buffer) => {
      if (!exited) {
        const str = stripAnsi(data.toString());
        stderr += str;
        appendOutput(str);
      }
    });

    let error: string | null = null;
    shell.on('error', (err: Error) => {
      error = err.message;
    });

    let code: number | null = null;
    let processSignal: NodeJS.Signals | null = null;
    shell.on('exit', (_code: number | null, _signal: NodeJS.Signals | null) => {
      exited = true;
      code = _code;
      processSignal = _signal;
    });

    const abortHandler = () => {
      if (shell.pid && !exited) {
        try {
          process.kill(-shell.pid, 'SIGTERM');
        } catch (_e) {
          shell.kill('SIGKILL');
        }
      }
    };
    abortSignal.addEventListener('abort', abortHandler);

    // Wait for the shell to exit
    try {
      await new Promise((resolve) => shell.on('exit', resolve));
    } finally {
      abortSignal.removeEventListener('abort', abortHandler);
    }

    let llmContent = '';
    if (abortSignal.aborted) {
      llmContent = 'HTB scan was cancelled by user before it could complete.';
      if (stdout.trim() || stderr.trim()) {
        llmContent += ` Below is the output before it was cancelled:\n${stdout}${stderr}`;
      }
    } else {
      llmContent = [
        `HTB Scan Type: ${params.scanType}`,
        `Target: ${params.target || '(none)'}`,
        `Command: ${command}`,
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Exit Code: ${code ?? '(none)'}`,
      ].join('\n');
    }

    let returnDisplayMessage = '';
    if (stdout.trim() || stderr.trim()) {
      returnDisplayMessage = stdout + stderr;
    } else if (abortSignal.aborted) {
      returnDisplayMessage = 'Scan cancelled by user.';
    } else if (error) {
      returnDisplayMessage = `Scan failed: ${error}`;
    } else if (code !== null && code !== 0) {
      returnDisplayMessage = `Scan exited with code: ${code}`;
    }

    return { llmContent, returnDisplay: returnDisplayMessage };
  }
} 