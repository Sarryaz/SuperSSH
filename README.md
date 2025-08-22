# SuperSSH - Enhanced n8n SSH Node

A powerful and feature-rich SSH node for n8n with enhanced credential management, advanced security options, and specialized support for Cisco and Aruba network devices.

## 🚀 Features

* **Custom Credentials**: Simple username/password fields that are always visible (similar to n8n-nodes-customssh)
* **Dynamic Parameters**: Use different servers in the same workflow, pass credentials from previous nodes, or use environment variables
* **Enhanced Credential Management**: Unified credential system with multiple authentication methods
* **Advanced Security Options**: Configurable ciphers, key exchange algorithms, and MAC algorithms
* **Network Device Support**: Specialized configurations for Cisco and Aruba network devices
* **Comprehensive Operations**: Command execution, file operations, system information, and network device management
* **Type Safety**: Full TypeScript implementation with proper interfaces

## 📦 Installation

### Prerequisites

* Node.js 18.10 or higher
* n8n instance (self-hosted)

### Install via npm

```bash
# Install directly in your n8n installation
npm install n8n-nodes-superssh
```

### Install via n8n Community Nodes

1. Go to **Settings** > **Community Nodes** in your n8n instance
2. Click **Install a community node**
3. Enter `n8n-nodes-superssh`
4. Click **Install**
5. Restart n8n

### Manual Installation

```bash
# Clone and build the project
git clone https://github.com/Sarryaz/SuperSSH.git
cd SuperSSH
npm install
npm run build

# Copy to your n8n custom nodes directory
cp -r dist/* ~/.n8n/custom/
```

## 🔧 Configuration

### Credential Types

1. **Custom**: Simple username and password fields (default) - always visible
2. **Standard SSH**: Basic SSH connection with password or private key
3. **Enhanced Security**: Advanced security algorithms and configurations
4. **Network Device**: Specialized for Cisco and Aruba network equipment

### Dynamic Parameters Support

The SuperSSH node now supports **dynamic parameters**, allowing you to:

* **Use different servers in the same workflow** - Connect to multiple servers dynamically
* **Pass credentials from previous nodes** - Use data from previous workflow steps
* **Use environment variables** - Store sensitive information securely

#### Configuration Modes

**1. Use Credentials (Default)**
- Traditional mode using stored SSH credentials
- Best for static connections and production environments

**2. Dynamic Parameters**
- Dynamic host, port, username, and password/private key
- Supports n8n expressions like `={{ $json.server_ip }}`
- Supports environment variables like `={{ $env.SSH_HOST }}`

#### Dynamic Parameters Examples

```json
// Use data from previous node
{
  "configMode": "dynamic",
  "dynamicHost": "={{ $json.server_ip }}",
  "dynamicPort": "={{ $json.ssh_port }}",
  "dynamicUsername": "={{ $json.username }}",
  "dynamicPassword": "={{ $json.password }}"
}

// Use environment variables
{
  "configMode": "dynamic",
  "dynamicHost": "={{ $env.SSH_HOST }}",
  "dynamicPort": "={{ $env.SSH_PORT }}",
  "dynamicUsername": "={{ $env.SSH_USER }}",
  "dynamicPassword": "={{ $env.SSH_PASS }}"
}
```

### Custom Credentials Feature

The **Custom** connection type provides a simplified interface similar to `n8n-nodes-customssh`:
- Username field is always visible
- Password field is always visible
- No complex authentication method selection needed
- Perfect for simple SSH connections

### Supported Operations

* **Command Execution**: Single, multiple, and sudo commands
* **File Operations**: Upload, download, list, and delete
* **System Information**: Overview, processes, disk usage, network interfaces
* **Network Devices**: Cisco and Aruba device info, configuration, interfaces, custom commands

## 📖 Usage Examples

### Basic Command Execution

```json
{
  "resource": "command",
  "operation": "execute",
  "command": "ls -la",
  "cwd": "/home/user"
}
```

### File Upload

```json
{
  "resource": "file",
  "operation": "upload",
  "path": "/home/user/uploads",
  "binaryPropertyName": "data"
}
```

### Network Device Info

```json
{
  "resource": "networkDevice",
  "operation": "getInfo"
}
```

## 🏗️ Project Structure

```
SuperSSH/
├── credentials/
│   └── SuperSshCredentials.credentials.ts
├── nodes/
│   └── SuperSsh/
│       └── SuperSsh.node.ts
├── utils/
│   └── utilities.ts
├── examples/
│   └── workflow-example.json
├── package.json
├── tsconfig.json
├── scripts/
│   └── copy-files.js
└── README.md
```

## 🔒 Security Features

* **Encryption**: AES128/256-GCM, ChaCha20-Poly1305
* **Key Exchange**: Curve25519, ECDH with NIST curves
* **Authentication**: HMAC-SHA2, UMAC algorithms
* **Host Keys**: RSA, Ed25519, ECDSA support

## 🧪 Testing

The node includes built-in credential testing and comprehensive error handling. Test your SSH connections before using in production workflows.

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

## 📞 Support

For support and questions:

* Open an issue on [GitHub](https://github.com/Sarryaz/SuperSSH)
* Check the n8n documentation
* Review the troubleshooting section

---

**Note**: This node requires proper SSH access to target systems. Ensure you have the necessary permissions and follow security best practices.
