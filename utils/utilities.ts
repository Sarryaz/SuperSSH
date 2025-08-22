import type { Config } from 'node-ssh';

// Define proper interfaces for better type safety
interface SecurityOptions {
	cipher?: string;
	kex?: string;
	mac?: string;
	hostKey?: string;
}

interface ConnectionOptions {
	connectTimeout?: number;
	keepaliveInterval?: number;
	maxRetries?: number;
	retryDelay?: number;
}

/**
 * Format a private key to ensure it's in the correct format for SSH connections
 */
export function formatPrivateKey(privateKey: string): string {
	// If the key already starts with '-----BEGIN', it's properly formatted
	if (privateKey.startsWith('-----BEGIN')) {
		return privateKey;
	}

	// Otherwise, add the OpenSSH header and footer
	return `-----BEGIN OPENSSH PRIVATE KEY-----\n${privateKey}\n-----END OPENSSH PRIVATE KEY-----`;
}

/**
 * Build SSH configuration object with enhanced security options
 */
export function buildSshConfig(
	host: string,
	username: string,
	port: number,
	authMethod: string,
	password?: string,
	privateKey?: string,
	passphrase?: string,
	securityOptions?: SecurityOptions,
	connectionOptions?: ConnectionOptions,
): Config {
	const config: Config = {
		host,
		username,
		port,
		readyTimeout: connectionOptions?.connectTimeout || 30000,
		keepaliveInterval: connectionOptions?.keepaliveInterval || 60000,
		keepaliveCountMax: 3,
	};

	// Add authentication
	if (authMethod === 'password' && password) {
		config.password = password;
	} else if (authMethod === 'privateKey' && privateKey) {
		config.privateKey = formatPrivateKey(privateKey);
		if (passphrase) {
			config.passphrase = passphrase;
		}
	}

	// Add enhanced security options if specified
	if (securityOptions) {
		if (securityOptions.cipher) {
			config.algorithms = {
				...config.algorithms,
				cipher: [securityOptions.cipher],
			};
		}
		if (securityOptions.kex) {
			config.algorithms = {
				...config.algorithms,
				kex: [securityOptions.kex],
			};
		}
		if (securityOptions.mac) {
			config.algorithms = {
				...config.algorithms,
				serverHostKey: [securityOptions.hostKey || 'ssh-ed25519'],
				mac: [securityOptions.mac],
			};
		}
	}

	return config;
}

/**
 * Validate SSH connection parameters
 */
export function validateSshParams(
	host: string,
	username: string,
	port: number,
	authMethod: string,
	password?: string,
	privateKey?: string,
): string[] {
	const errors: string[] = [];

	if (!host || host.trim() === '') {
		errors.push('Host is required');
	}

	if (!username || username.trim() === '') {
		errors.push('Username is required');
	}

	if (port < 1 || port > 65535) {
		errors.push('Port must be between 1 and 65535');
	}

	if (authMethod === 'password' && (!password || password.trim() === '')) {
		errors.push('Password is required for password authentication');
	}

	if (authMethod === 'privateKey' && (!privateKey || privateKey.trim() === '')) {
		errors.push('Private key is required for private key authentication');
	}

	return errors;
}

/**
 * Get network device specific commands
 */
export function getNetworkDeviceCommands(deviceType: string): Record<string, string> {
	const commands: Record<string, Record<string, string>> = {
		cisco: {
			terminalLength: 'terminal length 0',
			showVersion: 'show version',
			showRunning: 'show running-config',
			showInterfaces: 'show interfaces',
		},
		aruba: {
			terminalLength: 'no paging',
			showVersion: 'show version',
			showRunning: 'show running-config',
			showInterfaces: 'show interfaces',
		},
		generic: {
			terminalLength: '',
			showVersion: 'uname -a',
			showRunning: 'cat /etc/passwd',
			showInterfaces: 'ip addr show',
		},
	};

	return commands[deviceType] || commands.generic;
}

// Define interface for parsed output
interface ParsedOutput {
	raw: string;
	lines: string[];
	wordCount: number;
	hasError: boolean;
	json?: unknown;
	table?: string[][];
	// Additional properties for command execution
	stderr?: string;
	exitCode?: number;
	command?: string;
	cwd?: string;
	sudo?: boolean;
	path?: string;
	deviceType?: string;
}

/**
 * Parse SSH command output for common patterns
 */
export function parseSshOutput(output: string): ParsedOutput {
	const result: ParsedOutput = {
		raw: output,
		lines: output.split('\n').filter(line => line.trim() !== ''),
		wordCount: output.split(/\s+/).length,
		hasError: output.toLowerCase().includes('error') || output.toLowerCase().includes('failed'),
	};

	// Try to detect JSON output
	try {
		const jsonMatch = output.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
		if (jsonMatch) {
			result.json = JSON.parse(jsonMatch[0]);
		}
	} catch (e) {
		// Not valid JSON, continue with text parsing
	}

	// Try to detect table-like output
	const lines = output.split('\n');
	if (lines.length > 2) {
		const firstLine = lines[0];
		const secondLine = lines[1];
		
		// Check if it looks like a table (has separators like | or multiple spaces)
		if (firstLine.includes('|') || /\s{2,}/.test(firstLine)) {
			result.table = lines.map(line => line.split(/\s{2,}|(?<=\S)\s+(?=\S)/));
		}
	}

	return result;
}

/**
 * Generate SSH connection summary for logging
 */
export function generateConnectionSummary(
	host: string,
	username: string,
	port: number,
	authMethod: string,
	connectionType: string,
): string {
	return `SSH Connection: ${username}@${host}:${port} (${authMethod}) [${connectionType}]`;
}
