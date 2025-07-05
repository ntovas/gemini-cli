# Nmap Network Scanner Tool

The Nmap tool provides comprehensive network reconnaissance capabilities for penetration testing and security assessments, with specialized support for Hack The Box challenges.

## Overview

Nmap (Network Mapper) is one of the most important tools in a penetration tester's arsenal. This tool integrates nmap's powerful scanning capabilities into the Gemini CLI, making it easy to perform various types of network reconnaissance with intelligent recommendations and automated follow-up suggestions.

## Features

- **Multiple Scan Types**: Quick, comprehensive, stealth, UDP, vulnerability, service detection, OS fingerprinting, and custom scans
- **Smart Defaults**: Optimized configurations for common penetration testing scenarios
- **Hack The Box Optimized**: Pre-configured scan types ideal for HTB machine reconnaissance
- **Intelligent Output**: Parsed results with actionable recommendations
- **Safety Measures**: Confirmation prompts for potentially intrusive scans
- **Flexible Configuration**: Support for custom ports, scripts, timing, and flags

## Scan Types

### Quick Scan
**Purpose**: Fast initial reconnaissance to identify open ports and basic services  
**Duration**: ~30 seconds  
**Use Case**: First step in any penetration test or CTF challenge

```
Target: 10.10.10.1
Scan Type: quick
```

**What it does**:
- TCP SYN scan of top 1000 most common ports
- Fast timing template (T4) for quick results
- Basic service identification

### Comprehensive Scan  
**Purpose**: Thorough analysis with full port range and detailed service detection  
**Duration**: 5-10 minutes  
**Use Case**: Deep analysis after initial reconnaissance

```
Target: 10.10.10.1
Scan Type: comprehensive
```

**What it does**:
- Full TCP port range scan (1-65535)
- Service version detection (-sV)
- OS fingerprinting (-O)
- Aggressive scan options (-A)
- Requires sudo privileges

### Stealth Scan
**Purpose**: Slow, evasive scanning to avoid detection by IDS/firewalls  
**Duration**: 10-15 minutes  
**Use Case**: When stealth is important or aggressive scans are blocked

```
Target: 10.10.10.1
Scan Type: stealth
Timing: 1
```

**What it does**:
- Fragmented packets (-f)
- Random decoy hosts (-D RND:10)
- Slow timing template (T1)
- Randomized host order
- Variable packet sizes

### UDP Scan
**Purpose**: Discover UDP services like SNMP, DNS, DHCP  
**Duration**: 5-10 minutes  
**Use Case**: Finding UDP services often missed in TCP scans

```
Target: 10.10.10.1
Scan Type: udp
```

**What it does**:
- UDP port scan (-sU)
- Top 100 UDP ports
- May require sudo privileges

### Vulnerability Scan
**Purpose**: Identify known vulnerabilities using NSE scripts  
**Duration**: 10-20 minutes  
**Use Case**: Security assessment and vulnerability discovery

```
Target: 10.10.10.1
Scan Type: vuln
Scripts: vuln,safe,discovery
```

**What it does**:
- Service version detection
- Runs vulnerability detection scripts
- Safe and discovery scripts
- Identifies CVEs and security issues

### Service Detection
**Purpose**: Detailed service version identification  
**Duration**: 2-5 minutes  
**Use Case**: Banner grabbing and service fingerprinting

```
Target: 10.10.10.1
Scan Type: service
Ports: 22,80,443,3389
```

**What it does**:
- Maximum version detection intensity
- Service banner grabbing
- Application version identification

### OS Detection
**Purpose**: Operating system fingerprinting  
**Duration**: 1-3 minutes  
**Use Case**: Identifying target OS for exploit selection

```
Target: 10.10.10.1
Scan Type: os
```

**What it does**:
- TCP/IP stack fingerprinting
- OS guess with confidence ratings
- Device type identification

### Script Scan
**Purpose**: Run specific NSE scripts for targeted enumeration  
**Duration**: 5-15 minutes  
**Use Case**: Service-specific enumeration (HTTP, SMB, etc.)

```
Target: 10.10.10.1
Scan Type: script
Scripts: http-*
Ports: 80,443,8080
```

**What it does**:
- Runs specified NSE scripts
- Targeted service enumeration
- Custom script execution

### Custom Scan
**Purpose**: Advanced users can specify custom nmap flags  
**Duration**: Variable  
**Use Case**: Specialized scanning requirements

```
Target: 10.10.10.1
Scan Type: custom
Custom Flags: -sS -sV --version-intensity 9 -O --script=auth,default
```

## Common Hack The Box Scenarios

### Initial Machine Reconnaissance
```
1. Quick scan to identify open ports:
   Target: 10.10.10.100
   Scan Type: quick
   
2. Service detection on discovered ports:
   Target: 10.10.10.100
   Scan Type: service
   Ports: [discovered ports from step 1]
   
3. Vulnerability assessment:
   Target: 10.10.10.100
   Scan Type: vuln
```

### Web Application Testing
```
Target: 10.10.10.100
Scan Type: script
Scripts: http-*
Ports: 80,443,8080,8443
Description: Web service enumeration
```

**Follow-up tools**: gobuster, nikto, whatweb, burpsuite

### Windows Domain Controller
```
Target: 10.10.10.100
Scan Type: script
Scripts: smb-*,ldap-*
Ports: 53,88,135,139,389,445,464,593,636,3268,3269
Description: Windows DC enumeration
```

**Follow-up tools**: enum4linux, smbclient, crackmapexec, bloodhound

### SSH Service Analysis
```
Target: 10.10.10.100
Scan Type: script
Scripts: ssh-*
Ports: 22
Description: SSH service analysis
```

**Follow-up tools**: ssh-audit, hydra (for brute force)

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | IP address, hostname, or CIDR range |
| `scan_type` | enum | Yes | Type of scan to perform |
| `ports` | string | No | Specific ports to scan |
| `scripts` | string | No | NSE scripts to run |
| `timing` | enum | No | Timing template (0-5) |
| `custom_flags` | string | No | Custom nmap flags |
| `output_format` | enum | No | Output format preference |
| `description` | string | No | Scan description |

### Scan Types
- `quick`: Fast TCP SYN scan of common ports
- `comprehensive`: Full port range with service detection
- `stealth`: Slow, evasive scanning
- `udp`: UDP port scanning
- `vuln`: Vulnerability assessment
- `service`: Service version detection
- `os`: Operating system detection
- `script`: Custom NSE script execution
- `custom`: User-defined scan parameters

### Timing Templates
- `0`: Paranoid (very slow, IDS evasion)
- `1`: Sneaky (slow, some IDS evasion)
- `2`: Polite (slower, less network load)
- `3`: Normal (default timing)
- `4`: Aggressive (faster, assumes reliable network)
- `5`: Insane (very fast, may miss results)

## Examples

### Basic Quick Scan
```
Target: 10.10.10.1
Scan Type: quick
Description: Initial HTB machine recon
```

### Comprehensive Analysis
```
Target: 10.10.10.1
Scan Type: comprehensive
Timing: 4
Description: Full analysis of target machine
```

### Web Service Enumeration
```
Target: example.com
Scan Type: script
Ports: 80,443,8080,8443
Scripts: http-enum,http-title,http-methods
Description: Web application discovery
```

### Stealth Network Scan
```
Target: 192.168.1.0/24
Scan Type: stealth
Timing: 1
Description: Network discovery without detection
```

### Custom Advanced Scan
```
Target: 10.10.10.1
Scan Type: custom
Custom Flags: -sS -sV --version-intensity 9 -O --script=vuln,auth
Description: Advanced vulnerability assessment
```

## Best Practices

### 1. Progressive Scanning
Start with quick scans and progressively get more detailed:
1. Quick scan for port discovery
2. Service detection on open ports
3. Vulnerability assessment on interesting services
4. Custom scripts for specific services

### 2. Timing Considerations
- Use T4 (aggressive) for CTF environments
- Use T2 (polite) for production networks
- Use T1 (sneaky) when stealth is required

### 3. Port Selection
- Start with top 1000 ports for speed
- Full port scan (-p-) for comprehensive coverage
- Focus on specific ports for targeted enumeration

### 4. Script Usage
- Use `default,safe` for general enumeration
- Use `vuln` for vulnerability discovery
- Use service-specific scripts (http-*, smb-*, etc.)

### 5. Output Analysis
The tool provides parsed output with:
- Open ports summary
- Service identification
- OS detection results
- Vulnerability findings
- Follow-up recommendations

## Security Considerations

### Privileges Required
Some scan types require elevated privileges:
- **Comprehensive**: Requires sudo (SYN scan, OS detection)
- **Stealth**: Requires sudo (raw packet manipulation)
- **OS**: Requires sudo (TCP/IP fingerprinting)

### Legal and Ethical Usage
- Only scan systems you own or have explicit permission to test
- Respect rate limiting and network policies
- Be aware that scanning can be detected and logged
- Some scan techniques may trigger security alerts

### Network Impact
- Aggressive scans can impact network performance
- Stealth scans take longer but are less intrusive
- Consider using polite timing in production environments

## Integration with Other Tools

The nmap tool output provides intelligence for follow-up enumeration:

### Web Services (80, 443, 8080, etc.)
- **gobuster**: Directory and file enumeration
- **nikto**: Web vulnerability scanner
- **whatweb**: Technology identification
- **burpsuite**: Manual web application testing

### SMB Services (139, 445)
- **enum4linux**: SMB enumeration
- **smbclient**: SMB client access
- **smbmap**: SMB share enumeration
- **crackmapexec**: SMB credential testing

### SSH Services (22)
- **ssh-audit**: SSH configuration audit
- **hydra**: SSH brute force
- **paramiko**: SSH automation

### Database Services (3306, 1433, 5432, etc.)
- **sqlmap**: SQL injection testing
- **hydra**: Database brute force
- **database-specific clients**: Direct access testing

## Troubleshooting

### Common Issues

**Permission Denied**
- Some scans require sudo privileges
- Ensure user has appropriate permissions

**No Results**
- Target may be down or filtered
- Try different scan types or timing
- Check network connectivity

**Scan Too Slow**
- Increase timing template (T4, T5)
- Reduce port range
- Use quick scan first

**Firewall Blocking**
- Try stealth scan techniques
- Use fragmentation (-f)
- Try different scan types (UDP, ACK)

### Performance Tuning

**Faster Scans**
- Use higher timing templates (T4, T5)
- Limit port ranges
- Parallelize scanning of multiple targets

**More Accurate Results**
- Use slower timing templates (T2, T3)
- Increase version detection intensity
- Run multiple scan types

**Stealth Scanning**
- Use T1 or T0 timing
- Fragment packets (-f)
- Use decoy hosts (-D)
- Randomize scan order

This comprehensive nmap tool provides everything needed for effective network reconnaissance in penetration testing and Hack The Box challenges, with intelligent automation and safety measures built in.
