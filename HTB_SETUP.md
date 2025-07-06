# HTB Setup Guide

This guide helps you set up the HTB-modified Gemini CLI for optimal Hack The Box challenge solving.

## Prerequisites

1. **Kali Linux or similar pentesting distribution** (recommended)
   - Most HTB tools come pre-installed
   - Alternative: Install tools manually on your preferred OS

2. **HTB VPN connection**
   ```bash
   sudo openvpn your-htb-vpn-file.ovpn
   ```

3. **Required tools** (if not using Kali):
   - nmap
   - gobuster
   - sqlmap
   - hashcat
   - enum4linux
   - hydra
   - metasploit-framework
   - netcat

## Installation

1. Clone and build the HTB-modified Gemini CLI:
   ```bash
   git clone https://github.com/[your-repo]/gemini-cli.git
   cd gemini-cli
   npm install
   npm run build
   ```

2. Set up your API key:
   ```bash
   export GOOGLE_GENAI_API_KEY='your-api-key-here'
   ```

## Configuration

### 1. Create HTB workspace directory
```bash
mkdir ~/htb-challenges
cd ~/htb-challenges
```

### 2. Set up common wordlists
```bash
# If not using Kali, download essential wordlists
mkdir -p /usr/share/wordlists
cd /usr/share/wordlists

# RockYou password list
wget https://github.com/brannondorsey/naive-hashcat/releases/download/data/rockyou.txt

# Directory enumeration lists
git clone https://github.com/danielmiessler/SecLists.git
```

### 3. Configure Gemini CLI for HTB
Create a `.gemini/settings.json` file in your HTB workspace:

```json
{
  "coreTools": [
    "ShellTool",
    "HTBScannerTool",
    "ReadFileTool",
    "WriteFileTool",
    "GrepTool",
    "GlobTool",
    "EditTool",
    "WebFetchTool",
    "MemoryTool",
    "WebSearchTool"
  ],
  "approvalMode": "autoEdit"
}
```

### 4. Create useful aliases
Add to your `~/.bashrc` or `~/.zshrc`:

```bash
# HTB aliases
alias htb-gemini='cd ~/htb-challenges && gemini'
alias htb-vpn='sudo openvpn ~/htb-vpn/*.ovpn'
alias htb-ip='ip addr show tun0 | grep -oP "(?<=inet\s)\d+(\.\d+){3}"'

# Quick scan aliases
alias quick-nmap='nmap -sV -sC -oN initial_scan.txt'
alias full-nmap='nmap -p- -T4 -oN full_scan.txt'
alias web-enum='gobuster dir -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -u'
```

## Best Practices

### 1. Organization
Create a directory for each HTB machine:
```bash
mkdir -p ~/htb-challenges/{machine-name}/{scans,exploits,loot}
```

### 2. Documentation
Use Gemini's memory feature to track progress:
```
[tool_call: save_memory for content='Machine: Example, IP: 10.10.10.10, Ports: 22,80,445']
```

### 3. Tool Optimization
Configure tools for HTB environment:

**Nmap timing for HTB:**
```bash
# HTB machines can handle aggressive scanning
nmap -T4 -A <target>
```

**Gobuster settings:**
```bash
# Optimal thread count for HTB
gobuster dir -t 50 -w <wordlist> -u <target>
```

### 4. Security Considerations

- **Never run exploits on production systems**
- **Only target HTB-assigned IP addresses**
- **Use the HTB VPN, not public internet**
- **Don't share active machine writeups**

## Troubleshooting

### Common Issues

1. **Tools not found**
   ```bash
   # Install missing tools on Debian/Ubuntu
   sudo apt update
   sudo apt install nmap gobuster sqlmap hashcat hydra enum4linux
   ```

2. **Permission denied errors**
   ```bash
   # Some scans require root
   sudo gemini
   ```

3. **Slow scans**
   - Check VPN connection stability
   - Adjust tool timing parameters
   - Use more specific scans instead of full enumeration

### Performance Tips

1. **Use targeted scans**: Don't scan all 65535 ports unless necessary
2. **Leverage previous results**: Save scan outputs and reference them
3. **Parallelize tasks**: Run multiple enumeration tools simultaneously
4. **Cache wordlists**: Keep commonly used wordlists local

## Advanced Configuration

### Custom HTB Commands
Create a `.gemini/htb-commands.sh` file:

```bash
#!/bin/bash

# Quick privilege escalation check
htb-privesc() {
    echo "=== SUID Binaries ==="
    find / -perm -u=s -type f 2>/dev/null
    
    echo -e "\n=== Writable Directories ==="
    find / -writable -type d 2>/dev/null | grep -v proc
    
    echo -e "\n=== Cron Jobs ==="
    cat /etc/crontab
    ls -la /etc/cron.*
}

# Quick web enumeration
htb-web() {
    echo "Starting web enumeration on $1"
    nikto -h $1
    dirb $1 /usr/share/wordlists/dirb/common.txt
}
```

Source this in your Gemini sessions for quick access to custom commands.

## Getting Started

1. Connect to HTB VPN
2. Navigate to your HTB workspace
3. Start Gemini CLI
4. Begin with: "I need to hack the machine at [IP]. Start reconnaissance."

Happy hacking! 