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
  ToolExecuteConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import stripAnsi from 'strip-ansi';
import { spawn } from 'child_process';

export interface NmapToolParams {
  target: string;
  scan_type: 'quick' | 'comprehensive' | 'stealth' | 'udp' | 'vuln' | 'service' | 'os' | 'script' | 'custom';
  ports?: string;
  scripts?: string;
  timing?: '0' | '1' | '2' | '3' | '4' | '5';
  custom_flags?: string;
  output_format?: 'normal' | 'xml' | 'grepable' | 'all';
  description?: string;
}

const OUTPUT_UPDATE_INTERVAL_MS = 2000;

export class NmapTool extends BaseTool<NmapToolParams, ToolResult> {
  static readonly Name = 'nmap_scan';
  private whitelist: Set<string> = new Set();

  constructor(private readonly config: Config) {
    super(
      NmapTool.Name,
      'Network Scanner',
      `Advanced network reconnaissance tool using Nmap for penetration testing and Hack The Box challenges. 

This tool provides comprehensive network scanning capabilities including:
- Host discovery and port scanning
- Service version detection and OS fingerprinting  
- Vulnerability assessment using NSE scripts
- Stealth scanning techniques for IDS/firewall evasion
- Custom scan configurations for specific scenarios

Scan Types:
- Quick: Fast TCP SYN scan of common ports (~30 seconds)
- Comprehensive: Full TCP port range with service detection (~5-10 minutes)
- Stealth: Slow, fragmented scan to avoid detection (~10-15 minutes)
- UDP: UDP port scan for services like SNMP, DNS (~5-10 minutes)
- Vuln: Vulnerability scanning with NSE scripts (~10-20 minutes)
- Service: Detailed service version detection (~2-5 minutes)
- OS: Operating system detection and fingerprinting (~1-3 minutes)
- Script: Run specific NSE scripts for detailed enumeration (~5-15 minutes)
- Custom: Use custom nmap flags for advanced scenarios

Perfect for:
- Initial reconnaissance on Hack The Box machines
- Network enumeration during penetration tests
- Service discovery and vulnerability assessment
- Stealth scanning to avoid detection systems`,
      {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Target IP address, hostname, or CIDR range (e.g., 10.10.10.1, example.com, 192.168.1.0/24)',
          },
          scan_type: {
            type: 'string',
            enum: ['quick', 'comprehensive', 'stealth', 'udp', 'vuln', 'service', 'os', 'script', 'custom'],
            description: 'Type of scan to perform. Quick for fast discovery, comprehensive for thorough analysis, stealth for evasion, vuln for vulnerability assessment.',
          },
          ports: {
            type: 'string',
            description: 'Specific ports to scan (e.g., "22,80,443", "1-1000", "top-ports 1000"). If not specified, uses scan type defaults.',
          },
          scripts: {
            type: 'string',
            description: 'NSE scripts to run (e.g., "default", "vuln", "auth", "http-*", "smb-enum-*"). Used with script and vuln scan types.',
          },
          timing: {
            type: 'string',
            enum: ['0', '1', '2', '3', '4', '5'],
            description: 'Scan timing template (0=paranoid, 1=sneaky, 2=polite, 3=normal, 4=aggressive, 5=insane). Default is 3 for most scans, 1 for stealth.',
          },
          custom_flags: {
            type: 'string',
            description: 'Additional nmap flags for custom scans (e.g., "-sS -sV --version-intensity 9", "-f -D RND:10"). Use with custom scan type.',
          },
          output_format: {
            type: 'string',
            enum: ['normal', 'xml', 'grepable', 'all'],
            description: 'Output format preference. Normal for human-readable, xml for parsing, grepable for grep, all for multiple formats.',
          },
          description: {
            type: 'string',
            description: 'Brief description of the scan purpose for logging and tracking.',
          },
        },
        required: ['target', 'scan_type'],
      },
      false, // output is not markdown
      true, // output can be updated
    );
  }

  getDescription(params: NmapToolParams): string {
    let description = `nmap ${params.scan_type} scan of ${params.target}`;
    
    if (params.ports) {
      description += ` (ports: ${params.ports})`;
    }
    
    if (params.scripts) {
      description += ` (scripts: ${params.scripts})`;
    }
    
    if (params.description) {
      description += ` - ${params.description}`;
    }
    
    return description;
  }

  /**
   * Builds the nmap command based on scan type and parameters
   */
  private buildNmapCommand(params: NmapToolParams): string[] {
    const args: string[] = ['nmap'];
    
    // Set timing template
    const timing = params.timing || (params.scan_type === 'stealth' ? '1' : '3');
    args.push(`-T${timing}`);
    
    // Configure scan based on type
    switch (params.scan_type) {
      case 'quick':
        args.push('-sS', '-F'); // SYN scan, fast (top 100 ports)
        if (!params.ports) {
          args.push('--top-ports', '1000');
        }
        break;
        
      case 'comprehensive':
        args.push('-sS', '-sV', '-O', '-A'); // SYN scan, version detection, OS detection, aggressive
        args.push('-p-'); // All ports
        break;
        
      case 'stealth':
        args.push('-sS', '-f', '-D', 'RND:10'); // SYN scan, fragment packets, 10 random decoys
        args.push('--randomize-hosts', '--data-length', '200');
        if (!params.ports) {
          args.push('--top-ports', '1000');
        }
        break;
        
      case 'udp':
        args.push('-sU'); // UDP scan
        if (!params.ports) {
          args.push('--top-ports', '100');
        }
        break;
        
      case 'vuln':
        args.push('-sS', '-sV');
        args.push('--script', params.scripts || 'vuln,safe,discovery');
        if (!params.ports) {
          args.push('--top-ports', '1000');
        }
        break;
        
      case 'service':
        args.push('-sS', '-sV', '--version-intensity', '9');
        if (!params.ports) {
          args.push('--top-ports', '1000');
        }
        break;
        
      case 'os':
        args.push('-sS', '-O', '--osscan-guess');
        if (!params.ports) {
          args.push('--top-ports', '100');
        }
        break;
        
      case 'script':
        args.push('-sS');
        args.push('--script', params.scripts || 'default,safe');
        if (!params.ports) {
          args.push('--top-ports', '1000');
        }
        break;
        
      case 'custom':
        if (params.custom_flags) {
          // Parse custom flags and add them
          const customArgs = params.custom_flags.split(/\s+/).filter(arg => arg.length > 0);
          args.push(...customArgs);
        } else {
          args.push('-sS'); // Default to SYN scan
        }
        break;
        
      default:
        args.push('-sS'); // Default SYN scan
        break;
    }
    
    // Add specific ports if provided
    if (params.ports && !args.includes('-p-')) {
      args.push('-p', params.ports);
    }
    
    // Add output options
    args.push('-v'); // Verbose output
    
    // Add the target
    args.push(params.target);
    
    return args;
  }

  /**
   * Validates if the target is a valid IP, hostname, or CIDR range
   */
  private isValidTarget(target: string): boolean {
    // Simple validation for IP addresses, hostnames, and CIDR ranges
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:\/(?:[0-9]|[1-2][0-9]|3[0-2]))?$/;
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
    
    return ipv4Regex.test(target) || hostnameRegex.test(target) || ipv6Regex.test(target);
  }

  /**
   * Checks if the scan type requires elevated privileges
   */
  private requiresSudo(params: NmapToolParams): boolean {
    const sudoTypes = ['comprehensive', 'stealth', 'os'];
    const sudoFlags = ['-sS', '-sF', '-sX', '-sN', '-O'];
    
    if (sudoTypes.includes(params.scan_type)) {
      return true;
    }
    
    if (params.custom_flags) {
      return sudoFlags.some(flag => params.custom_flags!.includes(flag));
    }
    
    return false;
  }

  validateToolParams(params: NmapToolParams): string | null {
    if (!SchemaValidator.validate(this.parameterSchema as Record<string, unknown>, params)) {
      return 'Parameters failed schema validation.';
    }
    
    if (!params.target.trim()) {
      return 'Target cannot be empty.';
    }
    
    if (!this.isValidTarget(params.target)) {
      return 'Invalid target format. Use IP address, hostname, or CIDR range.';
    }
    
    // Validate ports format if provided
    if (params.ports) {
      const trimmedPorts = params.ports.trim();
      const portsRegex = /^(?:\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*|top-ports\s+\d+)$/;
      if (!portsRegex.test(trimmedPorts)) {
        return 'Invalid ports format. Use comma-separated ports, ranges, or "top-ports N".';
      }
    }
    
    // Check if custom scan type has custom flags
    if (params.scan_type === 'custom' && !params.custom_flags) {
      return 'Custom scan type requires custom_flags parameter.';
    }
    
    // Check if script scan type has scripts specified
    if (params.scan_type === 'script' && !params.scripts) {
      return 'Script scan type should specify scripts parameter.';
    }
    
    return null;
  }

  async shouldConfirmExecute(
    params: NmapToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false; // Skip confirmation, execute will fail
    }
    
    // Always confirm nmap scans as they can be intrusive
    const requiresSudo = this.requiresSudo(params);
    const command = this.buildNmapCommand(params).join(' ');
    
    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Nmap Network Scan',
      command: requiresSudo ? `sudo ${command}` : command,
      rootCommand: 'nmap',
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.whitelist.add('nmap');
        }
      },
    };
    
    return confirmationDetails;
  }

  async execute(
    params: NmapToolParams,
    abortSignal: AbortSignal,
    updateOutput?: (chunk: string) => void,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Nmap scan rejected: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    if (abortSignal.aborted) {
      return {
        llmContent: 'Nmap scan was cancelled by user before it could start.',
        returnDisplay: 'Scan cancelled by user.',
      };
    }

    const args = this.buildNmapCommand(params);
    const requiresSudo = this.requiresSudo(params);
    
    let command: string;
    let spawnArgs: string[];
    
    if (requiresSudo) {
      command = 'sudo';
      spawnArgs = args;
    } else {
      command = args[0];
      spawnArgs = args.slice(1);
    }

    let stdout = '';
    let stderr = '';
    let isCompleted = false;
    let exitCode: number | null = null;

    const child = spawn(command, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: this.config.getTargetDir(),
    });

    // Handle abort signal
    const abortListener = () => {
      if (!isCompleted) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!isCompleted) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }
    };
    abortSignal.addEventListener('abort', abortListener);

    // Set up output streaming
    let lastUpdateTime = 0;
    const updateOutputIfNeeded = () => {
      const now = Date.now();
      if (updateOutput && now - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS && stdout) {
        updateOutput(this.formatOutput(stdout, stderr, false));
        lastUpdateTime = now;
      }
    };

    return new Promise((resolve) => {
      child.stdout?.on('data', (data: Buffer) => {
        const chunk = stripAnsi(data.toString());
        stdout += chunk;
        updateOutputIfNeeded();
      });

      child.stderr?.on('data', (data: Buffer) => {
        const chunk = stripAnsi(data.toString());
        stderr += chunk;
        updateOutputIfNeeded();
      });

      child.on('error', (error: Error) => {
        isCompleted = true;
        abortSignal.removeEventListener('abort', abortListener);
        
        const errorMessage = getErrorMessage(error);
        resolve({
          llmContent: `Nmap scan failed: ${errorMessage}`,
          returnDisplay: `Error: ${errorMessage}`,
        });
      });

      child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        isCompleted = true;
        exitCode = code;
        abortSignal.removeEventListener('abort', abortListener);

        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          resolve({
            llmContent: 'Nmap scan was cancelled by user.',
            returnDisplay: 'Scan cancelled by user.',
          });
          return;
        }

        const output = this.formatOutput(stdout, stderr, true, exitCode);
        const summary = this.generateScanSummary(params, stdout, exitCode);

        resolve({
          llmContent: summary,
          returnDisplay: output,
        });
      });
    });
  }

  /**
   * Formats the output for display
   */
  private formatOutput(stdout: string, stderr: string, isComplete: boolean, exitCode?: number | null): string {
    let output = '';
    
    if (stdout) {
      output += `=== Nmap Scan Output ===\n${stdout}\n`;
    }
    
    if (stderr) {
      output += `=== Errors/Warnings ===\n${stderr}\n`;
    }
    
    if (isComplete) {
      output += `\n=== Scan Status ===\n`;
      output += `Exit Code: ${exitCode ?? 'unknown'}\n`;
      output += `Status: ${exitCode === 0 ? 'Completed successfully' : 'Completed with errors'}\n`;
    } else {
      output += '\n[Scan in progress...]';
    }
    
    return output;
  }

  /**
   * Generates a concise summary for the LLM
   */
  private generateScanSummary(params: NmapToolParams, stdout: string, exitCode: number | null): string {
    let summary = `Nmap ${params.scan_type} scan of ${params.target}:\n\n`;
    
    if (exitCode !== 0) {
      summary += `Scan completed with exit code ${exitCode}.\n\n`;
    }
    
    // Extract key information from stdout
    const lines = stdout.split('\n');
    const openPorts: string[] = [];
    const services: string[] = [];
    let osInfo = '';
    let hostStatus = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Extract host status
      if (trimmedLine.includes('Host is up')) {
        hostStatus = trimmedLine;
      }
      
      // Extract open ports
      if (trimmedLine.includes('/tcp') || trimmedLine.includes('/udp')) {
        if (trimmedLine.includes('open')) {
          openPorts.push(trimmedLine);
          
          // Extract service information
          const serviceParts = trimmedLine.split(/\s+/);
          if (serviceParts.length >= 3) {
            const service = serviceParts[2];
            if (service && service !== 'unknown' && !services.includes(service)) {
              services.push(service);
            }
          }
        }
      }
      
      // Extract OS information
      if (trimmedLine.includes('Running:') || trimmedLine.includes('OS details:')) {
        osInfo += trimmedLine + '\n';
      }
    }
    
    if (hostStatus) {
      summary += `Host Status: ${hostStatus}\n\n`;
    }
    
    if (openPorts.length > 0) {
      summary += `Open Ports Found: ${openPorts.length}\n`;
      openPorts.slice(0, 10).forEach(port => {
        summary += `  ${port}\n`;
      });
      if (openPorts.length > 10) {
        summary += `  ... and ${openPorts.length - 10} more ports\n`;
      }
      summary += '\n';
    } else {
      summary += 'No open ports found.\n\n';
    }
    
    if (services.length > 0) {
      summary += `Services Detected: ${services.join(', ')}\n\n`;
    }
    
    if (osInfo) {
      summary += `OS Information:\n${osInfo}\n`;
    }
    
    // Add scan recommendations
    if (params.scan_type === 'quick' && openPorts.length > 0) {
      summary += 'Recommendation: Run comprehensive or service scan for detailed analysis.\n';
    }
    
    if (params.scan_type === 'comprehensive' && openPorts.length > 0) {
      summary += 'Recommendation: Run vulnerability scan on discovered services.\n';
    }
    
    return summary;
  }
}
