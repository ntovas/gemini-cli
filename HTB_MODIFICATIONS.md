# Hack The Box Modifications

This document describes the modifications made to transform the Gemini CLI tool into a specialized Hack The Box (HTB) challenge solver.

## Changes Made

### 1. System Prompt Transformation (`packages/core/src/core/prompts.ts`)

The core system prompt has been completely rewritten to focus on:
- **HTB Challenge Solving**: Web exploitation, network enumeration, reverse engineering, cryptography, and privilege escalation
- **Penetration Testing Workflow**: Reconnaissance, vulnerability assessment, exploitation, post-exploitation, and documentation
- **HTB-Specific Tool Integration**: Nmap, Burp Suite, Metasploit, John/Hashcat, Gobuster, SQLMap, BloodHound
- **Security Testing Guidelines**: Initial enumeration strategies, web application testing, reverse shell techniques, and privilege escalation checklists
- **Ethical Guidelines**: Emphasizing responsible use on authorized HTB machines only

### 2. New HTB Scanner Tool (`packages/core/src/tools/htb-scanner.ts`)

Created a specialized tool that provides a unified interface for common HTB tools:
- **nmap**: Network port scanning and service enumeration
- **gobuster**: Directory and file enumeration on web servers
- **sqlmap**: Automated SQL injection testing
- **hashcat**: Password hash cracking
- **enum4linux**: SMB/Samba enumeration
- **hydra**: Login brute-forcing

The tool includes:
- Automatic command construction with HTB-optimized defaults
- Parameter validation based on scan type
- Real-time output streaming
- Proper error handling and user confirmation

### 3. Compression Prompt Updates

Modified the history compression prompt to maintain context about:
- Discovered services and vulnerabilities
- Obtained credentials
- Exploitation progress
- Captured flags

## Usage Examples

### Network Enumeration
```bash
# Using the HTB Scanner
[tool_call: htb_scanner for scanType='nmap' target='10.10.10.10' options='-p-']

# Using the Shell tool directly
[tool_call: run_shell_command for 'rustscan -a 10.10.10.10 -- -sV -sC']
```

### Web Enumeration
```bash
# Directory enumeration
[tool_call: htb_scanner for scanType='gobuster' target='http://10.10.10.10' wordlist='/usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt']

# SQL injection testing
[tool_call: htb_scanner for scanType='sqlmap' target='http://10.10.10.10/login.php' options='--forms --batch']
```

### Password Cracking
```bash
# Crack NTLM hashes
[tool_call: htb_scanner for scanType='hashcat' hashFile='hashes.txt' options='-m 1000' wordlist='/usr/share/wordlists/rockyou.txt']
```

### SMB Enumeration
```bash
[tool_call: htb_scanner for scanType='enum4linux' target='10.10.10.10']
```

## Important Resources

The system prompt includes references to essential HTB resources:
- **GTFOBins**: Unix binary exploitation
- **LOLBAS**: Windows binary exploitation
- **HackTricks**: Comprehensive pentesting methodology
- **PayloadsAllTheThings**: Payload database
- **Common wordlists**: rockyou.txt, dirb/common.txt, seclists

## Ethical Considerations

The tool emphasizes ethical hacking practices and includes reminders to:
- Only perform testing on authorized HTB machines
- Document findings for educational purposes
- Share knowledge responsibly within the security community

## Future Enhancements

Potential additions could include:
- Integration with more specialized tools (e.g., BloodHound, Mimikatz)
- Automated exploit suggestion based on discovered services
- Flag tracking and session management
- Integration with HTB API for challenge information 