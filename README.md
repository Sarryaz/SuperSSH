# SSH Nexus - The Ultimate SSH Automation Hub for n8n

> *"May the SSH be with you!"*

SSH Nexus is the most advanced and feature-rich SSH node for n8n, designed for network automation, system administration, and intelligent remote operations. Built with ❤️ by Sarryaz for the automation community!

## What Makes SSH Nexus Special?

SSH Nexus goes beyond basic SSH functionality with **intelligent features** that make network automation a breeze:
- **Connection Health Monitoring** - Real-time connection quality analysis
- **Smart Network Discovery** - Intelligent topology discovery and device detection  
- **Security Auditing** - Automated security configuration analysis
- **Performance Benchmarking** - System and network performance testing
- **AI-Optimized** - Built for seamless AI agent integration

## Unique Features

### Connection Health Monitoring
- **Health Check**: Comprehensive connection analysis with health scoring
- **Latency Testing**: Real-time latency and jitter measurement with quality assessment
- **Throughput Testing**: Data transfer performance analysis

### Smart Tools
- **Network Discovery**: Intelligent network topology discovery using ping and ARP
- **Port Scanner**: Smart port scanning with service detection
- **Performance Benchmark**: System performance testing (CPU, Memory, Disk, Network)
- **Security Audit**: Automated security configuration analysis with findings

## 📋 Core Features

### Core SSH Operations
- **Command Execution**: Execute single commands with sudo support
- **Multiple Commands**: Execute multiple commands in sequence with configurable wait times
- **Command List Execution**: AI-friendly command list execution from text input
- **File Operations**: Upload, download, list, and delete files
- **System Information**: Get system overview, processes, disk usage, and memory info

### Network Device Support
- **Device Information**: Get version, running configuration, startup configuration
- **Configuration Management**: Backup and restore device configurations with text or binary input
- **Configuration Options**: Support for running vs startup configs, merge vs replace operations
- **Interface Information**: Get network interface details
- **Custom Commands**: Execute device-specific commands
- **Privilege Escalation**: Support for enable mode with password

### Enhanced Security & Compatibility
- **Cipher Selection**: All available ciphers, secure-only, legacy-only, or specific ciphers
- **Advanced Security Options**: Compatibility levels, security levels, legacy algorithm support
- **Key Exchange Algorithms**: Configurable KEX algorithms with compatibility presets
- **HMAC Algorithms**: Configurable MAC algorithms with security level presets
- **Host Key Algorithms**: Configurable server host key algorithms

### Dynamic Parameters
- **Dynamic Hosts**: Use different servers in the same workflow
- **Dynamic Credentials**: Pass credentials from previous nodes
- **Environment Variables**: Use environment variables for sensitive data
- **Expression Support**: Full n8n expression support for all parameters

### Connection Options
- **Login Timeouts**: Configurable login and command prompt timeouts
- **Custom Prompts**: Regex-based prompt detection for different devices
- **Fallback Ciphers**: Automatic cipher fallback for compatibility
- **Verbose Logging**: Detailed connection and execution logging
- **Initial CR**: Send initial carriage return for device stimulation
- **Keyboard Interactive**: Support for keyboard-interactive authentication
- **Line Endings**: Configurable CRLF/LF line ending support

### Enhanced Prompt Handling
- **Device-Specific Detection**: Optimized prompt detection for Cisco, Aruba, and generic devices
- **MAC Address Table Detection**: Special handling for large MAC address table outputs
- **Stable Output Detection**: Intelligent timeout handling based on data flow patterns
- **Pagination Support**: Automatic handling of --MORE-- prompts with device-specific keys
- **Advanced ANSI Cleanup**: Comprehensive removal of control sequences and terminal codes
- **Aruba-Specific Optimizations**: Enhanced support for Aruba OS, CX, and AP devices
- **Privilege Escalation**: Automated enable mode handling for network devices

### Advanced Optimizations
- **Intelligent Logging**: Comprehensive logging system with buffer analysis and debug capabilities
- **Device-Specific Timeouts**: Optimized timeout handling for different device types
- **Character-by-Character Output**: Special handling for devices that send data character-by-character
- **Banner/MOTD Filtering**: Automatic removal of login banners and message-of-the-day content
- **Command Echo Removal**: Smart removal of command echoes with device-specific patterns
- **Output Stability Detection**: Intelligent detection of command completion based on data flow
- **SSH2 Support**: Enhanced SSH2-based connection manager for better cipher handling and retry logic
- **Advanced Cipher Fallback**: Intelligent retry mechanism with multiple cipher attempts

### SSH2 Enhanced Features
- **Advanced Algorithm Configuration**: Comprehensive cipher, KEX, HMAC, and server host key algorithm selection
- **Device-Specific Compatibility**: Automatic algorithm adjustment for Aruba OS and other legacy devices
- **Retry Logic**: Intelligent retry mechanism with configurable retry count and delay
- **Cipher Fallback**: Automatic fallback to alternative ciphers when connection fails
- **Keyboard-Interactive Auth**: Enhanced support for keyboard-interactive authentication
- **Connection Timeout Management**: Configurable connection timeouts with proper cleanup

### AI Agent Compatibility
- **Usable as Tool**: Available for AI agents and automation workflows
- **Structured Output**: Parsed command output with JSON and table detection
- **Error Handling**: Comprehensive error detection and reporting

### Configuration Management

```javascript
// Backup running configuration
{
  "resource": "networkDevice",
  "operation": "backupConfig",
  "configType": "running",
  "returnType": "text",
  "networkDeviceOptions": {
    "deviceType": "cisco"
  }
}

// Restore configuration from text input
{
  "resource": "networkDevice",
  "operation": "restoreConfig",
  "configSource": "text",
  "configCommands": "hostname router1\ninterface GigabitEthernet0/1\n description WAN",
  "applyMethod": "merge",
  "saveAfterApply": true,
  "networkDeviceOptions": {
    "deviceType": "aruba"
  }
}

// Restore configuration from binary data
{
  "resource": "networkDevice",
  "operation": "restoreConfig",
  "configSource": "binary",
  "binaryProperty": "configFile",
  "applyMethod": "replace",
  "saveAfterApply": false,
  "networkDeviceOptions": {
    "deviceType": "cisco"
  }
}
```

## Installation

Get started with SSH Nexus in seconds:

```bash
npm install n8n-nodes-ssh-nexus
```

🎉 **That's it!** Restart your n8n instance and find the shiny new **SSH Nexus** node in your palette, ready to supercharge your automation workflows!

### Quick Start
1. Drag the **SSH Nexus** node into your workflow
2. Configure your SSH credentials or use dynamic parameters
3. Choose from our powerful operations (Command, File, Network Device, System Info, Connection Health, Smart Tools)
4. Watch the magic happen! ✨

## Usage

### Basic Command Execution

```javascript
// Execute a simple command
{
  "resource": "command",
  "operation": "execute",
  "command": "ls -la"
}
```

### Network Device Operations

```javascript
// Get device information
{
  "resource": "networkDevice",
  "operation": "getVersion",
  "networkDeviceOptions": {
    "deviceType": "cisco"
  }
}

// Get running configuration
{
  "resource": "networkDevice",
  "operation": "getRunningConfig",
  "networkDeviceOptions": {
    "deviceType": "aruba"
  }
}
```

### Multiple Commands

```javascript
// Execute multiple commands with wait times
{
  "resource": "command",
  "operation": "executeMultiple",
  "commands": "show version\nshow interfaces\nshow ip route",
  "commandsFormat": "textList",
  "defaultWaitTime": 1000
}
```

### AI-Friendly Command Lists

```javascript
// Execute command list (AI-friendly)
{
  "resource": "command",
  "operation": "executeCommandList",
  "commands": "show version\nshow interfaces\nshow ip route",
  "defaultWaitTime": 1000
}
```

## Supported Device Types

- **Cisco**: IOS, IOS-XE, NX-OS
- **Aruba**: Aruba OS, Aruba CX, Aruba AP
- **Generic**: Linux, Unix, Windows (via SSH)

## Configuration Examples

### Secure Ciphers Only
```javascript
{
  "cipher": "secure-only",
  "compatibilityLevel": "modern-only",
  "securityLevel": "high"
}
```

### Legacy Device Compatibility
```javascript
{
  "cipher": "legacy-only",
  "compatibilityLevel": "high",
  "securityLevel": "low",
  "allowLegacyAlgorithms": true
}
```

### Custom Prompt Detection
```javascript
{
  "commandPrompt": "\\S+#\\s*$",
  "passwordPrompt": "Password:",
  "loginPromptTimeout": 10000
}
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Repository

[https://github.com/Sarryaz/SuperSSH](https://github.com/Sarryaz/SuperSSH)

## Support

For issues and feature requests, please use the GitHub repository.
