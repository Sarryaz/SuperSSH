import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class SuperSshCredentials implements ICredentialType {
	name = 'superSshCredentials';

	displayName = 'SSH Nexus Credentials';

	documentationUrl = 'https://docs.n8n.io/integrations/builtin/credentials/ssh/';

	properties: INodeProperties[] = [
					{
				displayName: 'Connection Type',
				name: 'connectionType',
				type: 'options',
				options: [
					{
						name: 'Custom Connection',
						value: 'custom',
						description: 'Quick setup with username and password fields',
					},
					{
						name: 'Standard SSH',
						value: 'standard',
						description: 'Standard SSH connection with basic security',
					},
					{
						name: 'Enhanced Security',
						value: 'enhanced',
						description: 'Advanced SSH connection with enhanced security options',
					},
					{
						name: 'Network Device',
						value: 'networkDevice',
						description: 'Optimized for Cisco, Aruba, and other network equipment',
					},
				],
				default: 'custom',
			},
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: '',
			placeholder: '192.168.1.100 or server.example.com',
			required: true,
			description: 'Hostname or IP address of the SSH server',
		},
		{
			displayName: '🔌 Port',
			name: 'port',
			type: 'number',
			default: 22,
			required: true,
			description: 'SSH port number (standard: 22)',
		},
		{
			displayName: '👤 Username',
			name: 'username',
			type: 'string',
			default: '',
			placeholder: 'admin, root, or your username',
			required: true,
			description: 'Username for SSH authentication',
		},
		{
			displayName: 'Authentication Method',
			name: 'authMethod',
			type: 'options',
			displayOptions: {
				show: {
					connectionType: ['standard', 'enhanced', 'networkDevice'],
				},
			},
			options: [
				{
					name: 'Password',
					value: 'password',
					description: 'Use password authentication',
				},
				{
					name: 'Private Key',
					value: 'privateKey',
					description: 'Use private key authentication',
				},
				{
					name: 'Interactive',
					value: 'interactive',
					description: 'Interactive authentication (for network devices)',
				},
			],
			default: 'password',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Password to use for authentication',
		},
		{
			displayName: 'Private Key',
			name: 'privateKey',
			type: 'string',
			typeOptions: {
				rows: 8,
				password: true,
			},
			default: '',
			displayOptions: {
				show: {
					authMethod: ['privateKey'],
				},
			},
			description: 'Private key content (PEM format)',
		},
		{
			displayName: 'Passphrase',
			name: 'passphrase',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			displayOptions: {
				show: {
					authMethod: ['privateKey'],
				},
			},
			description: 'Passphrase for the private key, if required',
		},
		// Enhanced Security Options
		{
			displayName: 'Security Options',
			name: 'securityOptions',
			type: 'collection',
			displayOptions: {
				show: {
					connectionType: ['enhanced'],
				},
			},
			default: {},
			options: [
				{
					displayName: 'Cipher Selection',
					name: 'cipher',
					type: 'options',
					options: [
						{ name: 'All Available Ciphers (Including Legacy)', value: 'all' },
						{ name: 'Secure Ciphers Only', value: 'secure-only' },
						{ name: 'Legacy Ciphers Only', value: 'legacy-only' },
						{ name: 'AES 128-bit CTR', value: 'aes128-ctr' },
						{ name: 'AES 192-bit CTR', value: 'aes192-ctr' },
						{ name: 'AES 256-bit CTR', value: 'aes256-ctr' },
						{ name: 'AES 128-bit GCM', value: 'aes128-gcm@openssh.com' },
						{ name: 'AES 256-bit GCM', value: 'aes256-gcm@openssh.com' },
						{ name: 'ChaCha20-Poly1305', value: 'chacha20-poly1305@openssh.com' },
						// Legacy ciphers
						{ name: 'AES 128-bit CBC (Legacy)', value: 'aes128-cbc' },
						{ name: 'AES 192-bit CBC (Legacy)', value: 'aes192-cbc' },
						{ name: 'AES 256-bit CBC (Legacy)', value: 'aes256-cbc' },
						{ name: '3DES CBC (Legacy)', value: '3des-cbc' },
					],
					default: 'all',
					description: 'Select specific cipher or cipher group for the SSH connection',
				},
				{
					displayName: 'Compatibility Level',
					name: 'compatibilityLevel',
					type: 'options',
					options: [
						{ name: 'High (Most Compatible, Less Secure)', value: 'high' },
						{ name: 'Medium (Balance of Compatibility and Security)', value: 'medium' },
						{ name: 'Legacy Only (For Very Old Devices)', value: 'legacy-only' },
						{ name: 'Modern Only (Most Secure, Least Compatible)', value: 'modern-only' },
					],
					default: 'medium',
					description: 'Compatibility level for key exchange and encryption algorithms',
				},
				{
					displayName: 'Security Level',
					name: 'securityLevel',
					type: 'options',
					options: [
						{ name: 'High (Most Secure)', value: 'high' },
						{ name: 'Medium (Balance)', value: 'medium' },
						{ name: 'Low (Most Compatible)', value: 'low' },
					],
					default: 'medium',
					description: 'Security level for MAC and host key algorithms',
				},
				{
					displayName: 'Allow Legacy Algorithms',
					name: 'allowLegacyAlgorithms',
					type: 'boolean',
					default: true,
					description: 'Allow older, less secure algorithms for maximum compatibility',
				},
				{
					displayName: 'KEX Algorithm',
					name: 'kex',
					type: 'options',
					options: [
						{
							name: 'curve25519-sha256',
							value: 'curve25519-sha256',
						},
						{
							name: 'curve25519-sha256@libssh.org',
							value: 'curve25519-sha256@libssh.org',
						},
						{
							name: 'ecdh-sha2-nistp256',
							value: 'ecdh-sha2-nistp256',
						},
						{
							name: 'ecdh-sha2-nistp384',
							value: 'ecdh-sha2-nistp384',
						},
						{
							name: 'ecdh-sha2-nistp521',
							value: 'ecdh-sha2-nistp521',
						},
					],
					default: 'curve25519-sha256',
					description: 'Key exchange algorithm (overrides compatibility level)',
				},
				{
					displayName: 'MAC Algorithm',
					name: 'mac',
					type: 'options',
					options: [
						{
							name: 'hmac-sha2-256',
							value: 'hmac-sha2-256',
						},
						{
							name: 'hmac-sha2-512',
							value: 'hmac-sha2-512',
						},
						{
							name: 'umac-64@openssh.com',
							value: 'umac-64@openssh.com',
						},
						{
							name: 'umac-128@openssh.com',
							value: 'umac-128@openssh.com',
						},
					],
					default: 'hmac-sha2-256',
					description: 'Message authentication code algorithm (overrides security level)',
				},
				{
					displayName: 'Host Key Algorithm',
					name: 'hostKey',
					type: 'options',
					options: [
						{
							name: 'ssh-rsa',
							value: 'ssh-rsa',
						},
						{
							name: 'ssh-ed25519',
							value: 'ssh-ed25519',
						},
						{
							name: 'ecdsa-sha2-nistp256',
							value: 'ecdsa-sha2-nistp256',
						},
						{
							name: 'ecdsa-sha2-nistp384',
							value: 'ecdsa-sha2-nistp384',
						},
						{
							name: 'ecdsa-sha2-nistp521',
							value: 'ecdsa-sha2-nistp521',
						},
					],
					default: 'ssh-ed25519',
					description: 'Host key algorithm',
				},
			],
		},
		// Network Device Options
		{
			displayName: 'Network Device Options',
			name: 'networkDeviceOptions',
			type: 'collection',
			displayOptions: {
				show: {
					connectionType: ['networkDevice'],
				},
			},
			default: {},
			options: [
				{
					displayName: 'Device Type',
					name: 'deviceType',
					type: 'options',
					options: [
						{
							name: 'Cisco',
							value: 'cisco',
						},
						{
							name: 'Aruba',
							value: 'aruba',
						},
						{
							name: 'Generic',
							value: 'generic',
						},
					],
					default: 'generic',
					description: 'Type of network device',
				},
				{
					displayName: 'Enable Mode Password',
					name: 'enablePassword',
					type: 'string',
					typeOptions: {
						password: true,
					},
					default: '',
					description: 'Password for enable/privileged mode (if required)',
				},
				{
					displayName: 'Terminal Length',
					name: 'terminalLength',
					type: 'number',
					default: 0,
					description: 'Terminal length (0 = no paging)',
				},
			],
		},
		// Connection Options
		{
			displayName: 'Connection Options',
			name: 'connectionOptions',
			type: 'collection',
			default: {},
			options: [
				{
					displayName: 'Connection Timeout',
					name: 'connectTimeout',
					type: 'number',
					default: 30000,
					description: 'Connection timeout in milliseconds',
				},
				{
					displayName: 'Keep Alive Interval',
					name: 'keepaliveInterval',
					type: 'number',
					default: 60000,
					description: 'Keep alive interval in milliseconds',
				},
				{
					displayName: 'Max Retries',
					name: 'maxRetries',
					type: 'number',
					default: 3,
					description: 'Maximum number of connection retries',
				},
				{
					displayName: 'Retry Delay',
					name: 'retryDelay',
					type: 'number',
					default: 1000,
					description: 'Delay between retries in milliseconds',
				},
				{
					displayName: 'Try Keyboard-Interactive',
					name: 'tryKeyboard',
					type: 'boolean',
					default: false,
					description: 'Enable keyboard-interactive authentication for devices requiring prompts',
				},
				{
					displayName: 'Login Prompt Timeout',
					name: 'loginPromptTimeout',
					type: 'number',
					default: 8000,
					description: 'Timeout for login prompt detection in milliseconds',
				},
				{
					displayName: 'Username Prompt',
					name: 'usernamePrompt',
					type: 'string',
					default: 'login:|username:|user:',
					description: 'Regular expression to match username prompt',
				},
				{
					displayName: 'Password Prompt',
					name: 'passwordPrompt',
					type: 'string',
					default: 'password:|Password:',
					description: 'Regular expression to match password prompt',
				},
				{
					displayName: 'Command Prompt',
					name: 'commandPrompt',
					type: 'string',
					default: '[#>$]\\s*$',
					description: 'Regular expression to match command prompt',
				},
				{
					displayName: 'Try Fallback Ciphers',
					name: 'fallbackCiphers',
					type: 'boolean',
					default: true,
					description: 'Automatically try other ciphers if the selected one fails',
				},
				{
					displayName: 'Verbose Logging',
					name: 'verboseLogging',
					type: 'boolean',
					default: false,
					description: 'Enable detailed logging (not recommended for production)',
				},
				{
					displayName: 'Send Initial CR',
					name: 'sendInitialCR',
					type: 'boolean',
					default: false,
					description: 'Send carriage return after connection (for some legacy devices)',
				},
				{
					displayName: 'Line Ending',
					name: 'lineEnding',
					type: 'options',
					options: [
						{ name: 'CRLF (\\r\\n)', value: 'CRLF' },
						{ name: 'LF (\\n)', value: 'LF' },
					],
					default: 'CRLF',
					description: 'Line ending used when sending commands in shell mode',
				},
			],
		},
	];
}
