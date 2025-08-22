import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class SuperSshCredentials implements ICredentialType {
	name = 'superSshCredentials';

	displayName = 'Super SSH Credentials';

	documentationUrl = 'https://docs.n8n.io/integrations/builtin/credentials/ssh/';

	properties: INodeProperties[] = [
		{
			displayName: 'Connection Type',
			name: 'connectionType',
			type: 'options',
			options: [
				{
					name: 'Standard SSH',
					value: 'standard',
					description: 'Standard SSH connection with basic security',
				},
				{
					name: 'Enhanced Security',
					value: 'enhanced',
					description: 'Enhanced SSH connection with advanced security options',
				},
				{
					name: 'Network Device',
					value: 'networkDevice',
					description: 'Specialized connection for Cisco and Aruba network devices',
				},
			],
			default: 'standard',
		},
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: '',
			placeholder: 'localhost',
			required: true,
			description: 'Hostname or IP address of the SSH server',
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 22,
			required: true,
			description: 'Port number of the SSH server',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
			description: 'Username to use for authentication',
		},
		{
			displayName: 'Authentication Method',
			name: 'authMethod',
			type: 'options',
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
			displayOptions: {
				show: {
					authMethod: ['password'],
				},
			},
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
					displayName: 'Cipher',
					name: 'cipher',
					type: 'options',
					options: [
						{
							name: 'AES128-GCM@openssh.com',
							value: 'aes128-gcm@openssh.com',
						},
						{
							name: 'AES256-GCM@openssh.com',
							value: 'aes256-gcm@openssh.com',
						},
						{
							name: 'chacha20-poly1305@openssh.com',
							value: 'chacha20-poly1305@openssh.com',
						},
						{
							name: 'aes128-ctr',
							value: 'aes128-ctr',
						},
						{
							name: 'aes192-ctr',
							value: 'aes192-ctr',
						},
						{
							name: 'aes256-ctr',
							value: 'aes256-ctr',
						},
					],
					default: 'aes256-gcm@openssh.com',
					description: 'Encryption cipher to use',
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
					description: 'Key exchange algorithm',
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
					description: 'Message authentication code algorithm',
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
			],
		},
	];
}
