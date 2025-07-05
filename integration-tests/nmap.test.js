/**
 * Integration test for the Nmap tool
 * This test demonstrates various scanning scenarios for Hack The Box challenges
 */

const { execSync } = require('child_process');
const path = require('path');

// Common Hack The Box scenarios and their corresponding nmap commands

const hackTheBoxScenarios = {
  'Initial Reconnaissance': {
    description: 'Quick scan to identify open ports and services',
    params: {
      target: '10.10.10.100',
      scan_type: 'quick',
      timing: '4',
      description: 'HTB machine initial recon'
    },
    expectedCommand: 'nmap -T4 -sS -F --top-ports 1000 -v 10.10.10.100'
  },

  'Comprehensive Analysis': {
    description: 'Full port scan with service detection and OS fingerprinting',
    params: {
      target: '10.10.10.100',
      scan_type: 'comprehensive',
      timing: '4',
      description: 'Deep analysis of HTB target'
    },
    expectedCommand: 'sudo nmap -T4 -sS -sV -O -A -p- -v 10.10.10.100'
  },

  'Web Service Enumeration': {
    description: 'Focused scan on web services with HTTP scripts',
    params: {
      target: '10.10.10.100',
      scan_type: 'script',
      ports: '80,443,8080,8443',
      scripts: 'http-*',
      timing: '3',
      description: 'Web service enumeration'
    },
    expectedCommand: 'nmap -T3 -sS --script http-* -p 80,443,8080,8443 -v 10.10.10.100'
  },

  'SMB Enumeration': {
    description: 'SMB service discovery and enumeration',
    params: {
      target: '10.10.10.100',
      scan_type: 'script',
      ports: '139,445',
      scripts: 'smb-*',
      timing: '3',
      description: 'SMB service enumeration'
    },
    expectedCommand: 'nmap -T3 -sS --script smb-* -p 139,445 -v 10.10.10.100'
  },

  'Vulnerability Assessment': {
    description: 'Vulnerability scanning with NSE scripts',
    params: {
      target: '10.10.10.100',
      scan_type: 'vuln',
      timing: '3',
      description: 'Vulnerability assessment scan'
    },
    expectedCommand: 'nmap -T3 -sS -sV --script vuln,safe,discovery --top-ports 1000 -v 10.10.10.100'
  },

  'Stealth Scan': {
    description: 'Slow, fragmented scan to avoid detection',
    params: {
      target: '10.10.10.100',
      scan_type: 'stealth',
      ports: 'top-ports 500',
      description: 'Stealth reconnaissance'
    },
    expectedCommand: 'nmap -T1 -sS -f -D RND:10 --randomize-hosts --data-length 200 -p top-ports 500 -v 10.10.10.100'
  },

  'UDP Service Discovery': {
    description: 'UDP scan for services like SNMP, DNS, DHCP',
    params: {
      target: '10.10.10.100',
      scan_type: 'udp',
      timing: '3',
      description: 'UDP service discovery'
    },
    expectedCommand: 'nmap -T3 -sU --top-ports 100 -v 10.10.10.100'
  },

  'Custom Advanced Scan': {
    description: 'Custom scan with specific flags',
    params: {
      target: '10.10.10.100',
      scan_type: 'custom',
      custom_flags: '-sS -sV --version-intensity 9 -O --script=auth,default,discovery',
      timing: '4',
      description: 'Advanced custom scan'
    },
    expectedCommand: 'sudo nmap -T4 -sS -sV --version-intensity 9 -O --script=auth,default,discovery -v 10.10.10.100'
  },

  'Network Discovery': {
    description: 'Discover live hosts in network range',
    params: {
      target: '10.10.10.0/24',
      scan_type: 'quick',
      timing: '4',
      description: 'Network host discovery'
    },
    expectedCommand: 'nmap -T4 -sS -F --top-ports 1000 -v 10.10.10.0/24'
  },

  'Service Version Detection': {
    description: 'Detailed service version detection',
    params: {
      target: '10.10.10.100',
      scan_type: 'service',
      ports: '22,80,443,3389,5985',
      timing: '4',
      description: 'Service version detection'
    },
    expectedCommand: 'nmap -T4 -sS -sV --version-intensity 9 -p 22,80,443,3389,5985 -v 10.10.10.100'
  }
};

// Example output parsing scenarios
const sampleNmapOutputs = {
  webServer: `
Starting Nmap 7.80 ( https://nmap.org ) at 2024-01-15 10:30:00 UTC
Nmap scan report for 10.10.10.100
Host is up (0.15s latency).

PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 8.2p1 Ubuntu 4ubuntu0.3 (Ubuntu Linux; protocol 2.0)
80/tcp   open  http    Apache httpd 2.4.41 ((Ubuntu))
443/tcp  open  ssl/http Apache httpd 2.4.41 ((Ubuntu))
3000/tcp open  http    Node.js (Express middleware)

Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Nmap done: 1 IP address (1 host up) scanned in 15.30 seconds
`,

  windowsServer: `
Starting Nmap 7.80 ( https://nmap.org ) at 2024-01-15 10:30:00 UTC
Nmap scan report for 10.10.10.100
Host is up (0.12s latency).

PORT     STATE SERVICE       VERSION
53/tcp   open  domain        Microsoft DNS 6.1.7601 (1DB15D39) (Windows Server 2008 R2 SP1)
88/tcp   open  kerberos-sec  Microsoft Windows Kerberos (server time: 2024-01-15 10:30:05Z)
135/tcp  open  msrpc         Microsoft Windows RPC
139/tcp  open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp  open  ldap          Microsoft Windows Active Directory LDAP (Domain: htb.local, Site: Default-First-Site-Name)
445/tcp  open  microsoft-ds  Windows Server 2008 R2 Standard 7601 Service Pack 1 microsoft-ds (workgroup: HTB)
464/tcp  open  kpasswd5?
593/tcp  open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
636/tcp  open  tcpwrapped
3268/tcp open  ldap          Microsoft Windows Active Directory LDAP (Domain: htb.local, Site: Default-First-Site-Name)
3269/tcp open  tcpwrapped

Service Info: Host: DC01; OS: Windows; CPE: cpe:/o:microsoft:windows_server_2008:r2:sp1, cpe:/o:microsoft:windows

Host script results:
|_clock-skew: mean: 6h59m59s, deviation: 0s, median: 6h59m59s
| smb-os-discovery: 
|   OS: Windows Server 2008 R2 Standard 7601 Service Pack 1 (Windows Server 2008 R2 Standard 6.1)
|   OS CPE: cpe:/o:microsoft:windows_server_2008::sp1
|   Computer name: DC01
|   NetBIOS computer name: DC01\\x00
|   Domain name: htb.local
|   Forest name: htb.local
|   FQDN: DC01.htb.local

Nmap done: 1 IP address (1 host up) scanned in 45.23 seconds
`
};

// Common attack vectors based on nmap results
const attackVectors = {
  ssh: {
    service: 'ssh',
    port: 22,
    reconnaissance: [
      'SSH banner grabbing',
      'Check for SSH key authentication',
      'Look for version vulnerabilities',
      'Attempt user enumeration'
    ],
    tools: ['ssh-audit', 'enum4linux', 'hydra', 'john']
  },

  http: {
    service: 'http',
    ports: [80, 8080, 3000, 8000],
    reconnaissance: [
      'Directory enumeration with gobuster/dirbuster',
      'Technology identification with whatweb',
      'Check for common vulnerabilities (SQLi, XSS)',
      'Look for admin panels and sensitive files'
    ],
    tools: ['gobuster', 'nikto', 'whatweb', 'burpsuite', 'ffuf']
  },

  https: {
    service: 'https',
    ports: [443, 8443],
    reconnaissance: [
      'SSL certificate analysis',
      'Check for SSL vulnerabilities',
      'Directory enumeration',
      'API endpoint discovery'
    ],
    tools: ['sslscan', 'testssl.sh', 'gobuster', 'ffuf']
  },

  smb: {
    service: 'smb',
    ports: [139, 445],
    reconnaissance: [
      'Share enumeration with smbclient',
      'Null session testing',
      'User enumeration',
      'Check for SMB vulnerabilities (EternalBlue, etc.)'
    ],
    tools: ['smbclient', 'enum4linux', 'smbmap', 'crackmapexec']
  },

  ldap: {
    service: 'ldap',
    ports: [389, 636, 3268, 3269],
    reconnaissance: [
      'Anonymous bind testing',
      'User and group enumeration',
      'Domain information gathering',
      'Check for LDAP injection'
    ],
    tools: ['ldapsearch', 'enum4linux', 'bloodhound']
  },

  rdp: {
    service: 'rdp',
    port: 3389,
    reconnaissance: [
      'Check for weak credentials',
      'NLA bypass techniques',
      'Certificate analysis',
      'Session hijacking possibilities'
    ],
    tools: ['rdesktop', 'freerdp', 'hydra', 'crowbar']
  }
};

console.log('=== Nmap Tool Integration Test Scenarios ===\\n');

Object.entries(hackTheBoxScenarios).forEach(([scenario, config]) => {
  console.log(`Scenario: ${scenario}`);
  console.log(`Description: ${config.description}`);
  console.log(`Parameters:`, JSON.stringify(config.params, null, 2));
  console.log(`Expected Command: ${config.expectedCommand}`);
  console.log('---\\n');
});

console.log('=== Sample Attack Methodology ===\\n');

console.log('1. Initial Reconnaissance:');
console.log('   - Quick scan to identify open ports');
console.log('   - Follow up with service detection on discovered ports');
console.log('   - Run vulnerability scripts on interesting services\\n');

console.log('2. Service-Specific Enumeration:');
Object.entries(attackVectors).forEach(([service, info]) => {
  console.log(`   ${service.toUpperCase()}:`);
  console.log(`     Ports: ${Array.isArray(info.ports) ? info.ports.join(', ') : info.port}`);
  console.log(`     Recon Steps:`);
  info.reconnaissance.forEach(step => console.log(`       - ${step}`));
  console.log(`     Tools: ${info.tools.join(', ')}`);
  console.log('');
});

console.log('3. Vulnerability Assessment:');
console.log('   - Run NSE vulnerability scripts');
console.log('   - Check for default credentials');
console.log('   - Look for misconfigurations');
console.log('   - Search for public exploits\\n');

console.log('=== Integration Test Complete ===');

module.exports = {
  hackTheBoxScenarios,
  sampleNmapOutputs,
  attackVectors
};
