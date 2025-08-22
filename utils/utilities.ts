import type { IDataObject, GenericValue } from 'n8n-workflow';
import { LoggingUtils } from './LoggingUtils';

// Export LoggingUtils for use in other files
export { LoggingUtils } from './LoggingUtils';

// Export SSH2 Connection Manager for enhanced SSH handling
export { Ssh2ConnectionManager } from './Ssh2ConnectionManager';

// Define proper interfaces for better type safety
interface SecurityOptions {
	cipher?: string;
	kex?: string;
	mac?: string;
	hostKey?: string;
	compatibilityLevel?: 'high' | 'medium' | 'legacy-only' | 'modern-only';
	securityLevel?: 'high' | 'medium' | 'low';
	allowLegacyAlgorithms?: boolean;
}

interface ConnectionOptions {
	connectTimeout?: number;
	keepaliveInterval?: number;
	maxRetries?: number;
	retryDelay?: number;
	loginPromptTimeout?: number;
	usernamePrompt?: string;
	passwordPrompt?: string;
	commandPrompt?: string;
	fallbackCiphers?: boolean;
	verboseLogging?: boolean;
	sendInitialCR?: boolean;
	tryKeyboard?: boolean;
	lineEnding?: 'CRLF' | 'LF';
	debugBuffer?: boolean;
	allowEmptyPrompt?: boolean;
	stableOutputDetection?: boolean;
	lastDataTime?: number;
}

/**
 * Utility class for handling SSH cipher configurations
 */
export class CipherUtils {
	/**
	 * Get list of ciphers based on user selection
	 */
	static configureCiphers(cipherSelection: string): string[] {
		// Modern secure ciphers (most compatible)
		const secureCiphers = [
			'aes128-ctr',  // Most compatible for older devices
			'aes192-ctr',
			'aes256-ctr',
			'aes128-gcm@openssh.com',
			'aes256-gcm@openssh.com',
			'chacha20-poly1305@openssh.com',
		];

		// Legacy ciphers (older/less secure, but needed for some devices)
		const legacyCiphers = [
			'aes128-cbc',
			'aes192-cbc',
			'aes256-cbc',
			'3des-cbc',
		];

		// Handle specific cipher selection
		if (cipherSelection === 'all') {
			return [...secureCiphers, ...legacyCiphers];
		} else if (cipherSelection === 'secure-only') {
			return secureCiphers;
		} else if (cipherSelection === 'legacy-only') {
			return legacyCiphers;
		} else if (cipherSelection === 'aes128-ctr') {
			// For devices that specifically need aes128-ctr, prioritize it
			return ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'];
		} else if (cipherSelection === 'aes256-ctr') {
			return ['aes256-ctr', 'aes192-ctr', 'aes128-ctr'];
		} else if (cipherSelection === 'aes256-cbc') {
			return ['aes256-cbc', 'aes128-cbc'];
		}

		// For any other specific cipher, return it as the first option with fallbacks
		return [cipherSelection, 'aes128-ctr', 'aes256-ctr'];
	}

	/**
	 * Configure key exchange algorithms based on compatibility needs
	 */
	static configureKexAlgorithms(compatibility: string): string[] {
		// Modern secure key exchange algorithms
		const secureKex = [
			'ecdh-sha2-nistp256',
			'ecdh-sha2-nistp384',
			'ecdh-sha2-nistp521',
			'diffie-hellman-group-exchange-sha256',
			'diffie-hellman-group14-sha256',
			'diffie-hellman-group16-sha512',
			'diffie-hellman-group18-sha512',
		];

		// Legacy key exchange algorithms (older/less secure, but more compatible)
		const legacyKex = [
			'diffie-hellman-group1-sha1',
			'diffie-hellman-group14-sha1',
			'diffie-hellman-group-exchange-sha1',
		];

		if (compatibility === 'high') {
			return [...secureKex, ...legacyKex];
		} else if (compatibility === 'legacy-only') {
			return legacyKex;
		} else if (compatibility === 'modern-only') {
			return secureKex;
		}

		// Default to medium compatibility - prioritize the most compatible algorithms
		return [
			'diffie-hellman-group14-sha1',  // Most compatible for older devices
			'diffie-hellman-group14-sha256',
			'ecdh-sha2-nistp256',
			'diffie-hellman-group-exchange-sha256',
			...secureKex
		];
	}

	/**
	 * Configure HMAC algorithms based on security level
	 */
	static configureHmacAlgorithms(securityLevel: string): string[] {
		// Modern secure HMAC algorithms
		const secureHmacs = [
			'hmac-sha2-256-etm@openssh.com',
			'hmac-sha2-512-etm@openssh.com',
			'hmac-sha2-256',
			'hmac-sha2-512',
		];

		// Legacy HMAC algorithms (more compatible with older devices)
		const legacyHmacs = [
			'hmac-sha1',
			'hmac-md5',
			'hmac-sha1-96',
			'hmac-md5-96',
		];

		if (securityLevel === 'high') {
			return secureHmacs;
		} else if (securityLevel === 'low') {
			return [...secureHmacs, ...legacyHmacs];
		}

		// Default to medium security - prioritize compatibility
		return [
			'hmac-sha1',  // Most compatible for older devices
			'hmac-sha2-256',
			'hmac-sha2-256-etm@openssh.com',
			...secureHmacs
		];
	}
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
): any {
	const config: any = {
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

	// Optional keyboard-interactive support for devices requiring prompts
	if (connectionOptions?.tryKeyboard && authMethod === 'password' && password) {
		config.tryKeyboard = true;
		config.onKeyboardInteractive = (
			name: string,
			instructions: string,
			lang: string,
			prompts: Array<{ prompt: string; echo: boolean }>,
			finish: (responses: string[]) => void,
		) => {
			const responses = prompts.map((p) =>
				/assword/i.test(p.prompt) ? password : '',
			);
			finish(responses);
		};
	}

	// Add enhanced security options if specified
	if (securityOptions) {
		// Initialize algorithms object if not present
		if (!config.algorithms) {
			config.algorithms = {};
		}

		// Configure ciphers - this is critical for device compatibility
		if (securityOptions.cipher) {
			const ciphers = CipherUtils.configureCiphers(securityOptions.cipher);
			config.algorithms.cipher = ciphers;
			// Also set the legacy cipher property for node-ssh compatibility
			config.ciphers = ciphers;
		}

		// Configure key exchange algorithms
		if (securityOptions.compatibilityLevel) {
			const kexAlgorithms = CipherUtils.configureKexAlgorithms(securityOptions.compatibilityLevel);
			config.algorithms.kex = kexAlgorithms;
			// Also set the legacy kex property for node-ssh compatibility
			config.kex = kexAlgorithms;
		} else if (securityOptions.kex) {
			config.algorithms.kex = [securityOptions.kex];
			config.kex = [securityOptions.kex];
		}

		// Configure HMAC algorithms
		if (securityOptions.securityLevel) {
			const hmacAlgorithms = CipherUtils.configureHmacAlgorithms(securityOptions.securityLevel);
			config.algorithms.hmac = hmacAlgorithms;
			// Also set the legacy mac property for node-ssh compatibility
			config.mac = hmacAlgorithms;
		} else if (securityOptions.mac) {
			config.algorithms.hmac = [securityOptions.mac];
			config.mac = [securityOptions.mac];
		}

		// Configure host key algorithms
		if (securityOptions.hostKey) {
			config.algorithms.serverHostKey = [securityOptions.hostKey];
			config.serverHostKey = [securityOptions.hostKey];
		} else if (securityOptions.allowLegacyAlgorithms !== undefined) {
			// Apply sensible defaults for server host keys based on legacy allowance
			const legacyAllowed = securityOptions.allowLegacyAlgorithms;
			const hostKeys = legacyAllowed
				? [
					'ssh-rsa',
					'ssh-dss',
					'ecdsa-sha2-nistp256',
					'ecdsa-sha2-nistp384',
					'ecdsa-sha2-nistp521',
					'rsa-sha2-512',
					'rsa-sha2-256',
				]
				: [
					'ecdsa-sha2-nistp256',
					'ecdsa-sha2-nistp384',
					'ecdsa-sha2-nistp521',
					'rsa-sha2-512',
					'rsa-sha2-256',
				];
			config.algorithms.serverHostKey = hostKeys;
			config.serverHostKey = hostKeys;
		}
	}

	// Ensure we always have some cipher options for compatibility
	if (!config.algorithms?.cipher && !config.ciphers) {
		// Default to aes128-ctr which is most compatible with older devices
		if (!config.algorithms) config.algorithms = {};
		config.algorithms.cipher = ['aes128-ctr', 'aes256-ctr'];
		config.ciphers = ['aes128-ctr', 'aes256-ctr'];
	}

	// Ensure we always have some KEX options for compatibility
	if (!config.algorithms?.kex && !config.kex) {
		if (!config.algorithms) config.algorithms = {};
		config.algorithms.kex = ['diffie-hellman-group14-sha1', 'diffie-hellman-group14-sha256'];
		config.kex = ['diffie-hellman-group14-sha1', 'diffie-hellman-group14-sha256'];
	}

	// Ensure we always have some HMAC options for compatibility
	if (!config.algorithms?.hmac && !config.mac) {
		if (!config.algorithms) config.algorithms = {};
		config.algorithms.hmac = ['hmac-sha1', 'hmac-sha2-256'];
		config.mac = ['hmac-sha1', 'hmac-sha2-256'];
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
	} else if (!/^[a-zA-Z0-9.-]+$/.test(host) && !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(host)) {
		errors.push('Host must be a valid hostname or IP address');
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
			showStartup: 'show startup-config',
			backupConfig: 'show running-config',
			restoreConfig: 'copy tftp running-config',
			saveConfig: 'write memory',
			showInterfaces: 'show interfaces',
		},
		aruba: {
			terminalLength: 'no paging',
			showVersion: 'show version',
			showRunning: 'show running-config',
			showStartup: 'show config startup',
			backupConfig: 'show running-config',
			restoreConfig: 'copy tftp running-config',
			saveConfig: 'write memory',
			showInterfaces: 'show interfaces',
		},
		'aruba-os': {
			terminalLength: 'no page',
			showVersion: 'show version',
			showRunning: 'show running-config',
			showStartup: 'show config',
			backupConfig: 'show running-config',
			restoreConfig: 'copy tftp running-config',
			saveConfig: 'write memory',
			showInterfaces: 'show interfaces',
		},
		generic: {
			terminalLength: '',
			showVersion: 'uname -a',
			showRunning: 'cat /etc/passwd',
			showStartup: 'cat /etc/passwd',
			backupConfig: 'cat /etc/passwd',
			restoreConfig: 'echo "Restore not supported"',
			saveConfig: 'echo "Save not supported"',
			showInterfaces: 'ip addr show',
		},
	};

	// Return commands for the specified device type, fallback to generic if not found
	return commands[deviceType.toLowerCase()] || commands.generic;
}

// Define interface for parsed output
interface ParsedOutput extends IDataObject {
	raw: string;
	lines: string[];
	wordCount: number;
	hasError: boolean;
	json?: IDataObject | GenericValue | GenericValue[] | IDataObject[];
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
 * Parse SSH command output based on specified format
 */
export function parseSshOutput(output: string, parseMode: string = 'smart'): ParsedOutput {
	const result: ParsedOutput = {
		raw: output,
		lines: output.split('\n').filter(line => line.trim() !== ''),
		wordCount: output.split(/\s+/).filter(word => word.trim() !== '').length,
		hasError: output.toLowerCase().includes('error') || output.toLowerCase().includes('failed'),
	};

	// Handle different parsing modes
	switch (parseMode) {
		case 'json':
			// Force JSON parsing only
			try {
				const trimmedOutput = output.trim();
				if ((trimmedOutput.startsWith('{') && trimmedOutput.endsWith('}')) ||
					(trimmedOutput.startsWith('[') && trimmedOutput.endsWith(']'))) {
					result.json = JSON.parse(trimmedOutput);
				} else {
					// Look for JSON patterns within the output
					const jsonMatch = output.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
					if (jsonMatch) {
						result.json = JSON.parse(jsonMatch[0]);
					}
				}
			} catch (e) {
				// JSON parsing failed, return raw output
				result.json = null;
			}
			break;

		case 'table':
			// Force table parsing only
			const tableLines = output.split('\n');
			if (tableLines.length > 2) {
				const firstLine = tableLines[0];
				if (firstLine.includes('|') || /\s{2,}/.test(firstLine)) {
					result.table = tableLines.map(line => line.split(/\s{2,}|(?<=\S)\s+(?=\S)/));
				}
			}
			break;

		case 'raw':
			// Return formatted raw text (clean up but don't parse)
			result.raw = output.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
			result.lines = result.raw.split('\n').filter(line => line.trim() !== '');
			break;

		case 'smart':
		default:
			// Smart parsing - try JSON first, then table, then fallback to text
			try {
				const trimmedOutput = output.trim();
				if ((trimmedOutput.startsWith('{') && trimmedOutput.endsWith('}')) ||
					(trimmedOutput.startsWith('[') && trimmedOutput.endsWith(']'))) {
					result.json = JSON.parse(trimmedOutput);
				} else {
					// Look for JSON patterns within the output
					const jsonMatch = output.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
					if (jsonMatch) {
						result.json = JSON.parse(jsonMatch[0]);
					}
				}
			} catch (e) {
				// Not valid JSON, continue with text parsing
			}

			// Try to detect table-like output
			const smartLines = output.split('\n');
			if (smartLines.length > 2) {
				const firstLine = smartLines[0];
				if (firstLine.includes('|') || /\s{2,}/.test(firstLine)) {
					result.table = smartLines.map(line => line.split(/\s{2,}|(?<=\S)\s+(?=\S)/));
				}
			}
			break;
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

/**
 * Prompt handling utilities for shell-based device interactions
 */
export class PromptHandler {
	/**
	 * Wait until the provided prompt regex appears in the accumulated output
	 */
	static async waitForPrompt(
		stream: any,
		promptRegex: RegExp,
		timeoutMs: number,
		onData?: (chunk: Buffer) => void,
		options?: {
			deviceType?: string;
			verbose?: boolean;
			debugBuffer?: boolean;
			allowEmptyPrompt?: boolean;
			stableOutputDetection?: boolean;
			lastDataTime?: number;
			deviceSpecific?: {
				handlePagination?: boolean;
				paginationPrompt?: string;
				paginationContinue?: string;
				knownPrompts?: string[];
			};
		},
	): Promise<void> {
		return new Promise((resolve, reject) => {
			let buffer = '';
			let lastDataReceived = Date.now();
			const deviceType = options?.deviceType || 'generic';
			const verbose = options?.verbose || false;
			const debugBuffer = options?.debugBuffer || false;
			const allowEmptyPrompt = options?.allowEmptyPrompt || false;
			const deviceSpecific = options?.deviceSpecific || {};
			const isArubaDevice = deviceType === 'aruba';
			const isArubaOsDevice = deviceType === 'aruba-os';
			const isArubaApDevice = deviceType === 'aruba-ap';

			// Detect MAC address table commands for special handling
			let commandName = '';
			if (buffer.includes('show mac-address')) {
				commandName = 'show mac-address';
			}
			const isMacAddressTable = commandName === 'show mac-address' ||
				buffer.includes('MAC Address') ||
				/[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}\s+\w+\s+\d+/.test(buffer);

			// Try to detect common prompt patterns or handle special cases
			const checkForPrompt = (buffer: string): boolean => {
				// Special case: Allow empty buffer as a prompt if the option is enabled
				if (buffer.length === 0 && allowEmptyPrompt) {
					LoggingUtils.log('Empty buffer accepted as prompt', verbose);
					return true;
				}

				// Remove ANSI escape sequences for more reliable matching
				const cleanBuffer = buffer.replace(/\x1B\[\??\d*(?:[;\d]*)?[A-Za-z]/g, '');

				// Special case for MAC address table output in Aruba OS
				if (isArubaOsDevice && isMacAddressTable) {
					const now = Date.now();
					const timeSinceLastData = now - lastDataReceived;
					// Check for end of MAC address table output patterns
					const macTableEndPattern = /[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}\s+\w+\s+\d+\s*\r?\n\s*$/;
					// If we see a MAC address followed by a blank line or we've had no data for 2.5 seconds
					if ((macTableEndPattern.test(cleanBuffer) && timeSinceLastData > 1500) ||
						timeSinceLastData > 2500) {
						LoggingUtils.log(`MAC address table output complete - detected end of output after ${timeSinceLastData}ms pause`, verbose);
						return true;
					}
				}

				// Check for pagination prompts
				if (deviceSpecific.handlePagination) {
					const paginationPrompt = deviceSpecific.paginationPrompt || '--MORE--';
					if (buffer.includes(paginationPrompt) || cleanBuffer.includes(paginationPrompt)) {
						LoggingUtils.log(`Pagination prompt detected: "${paginationPrompt}"`, verbose);
						// Send space to continue
						const continueKey = deviceSpecific.paginationContinue || ' ';
						try { stream.write(continueKey); } catch {}
						// Update lastDataReceived to prevent timeout during pagination
						lastDataReceived = Date.now();
						// Don't resolve yet, as we need to continue collecting data
						return false;
					}
				}

				// Specific handling for Aruba OS switches
				if (isArubaOsDevice) {
					// Look for common Aruba OS prompt patterns at the end of lines
					const lines = cleanBuffer.split('\n');
					const lastLine = lines.length > 0 ? lines[lines.length - 1].trim() : '';
					// Check for various prompt patterns that could appear in Aruba OS
					if (lastLine === '>' ||
						lastLine.endsWith('>') ||
						lastLine === '#' ||
						lastLine.endsWith('#') ||
						lastLine.includes('(config)#') ||
						lastLine.includes('(config-if)#') ||
						lastLine.includes('(config-vlan)#')) {
						LoggingUtils.log(`Aruba OS prompt detected in last line: "${lastLine}"`, verbose);
						return true;
					}

					// Look for known Aruba OS prompts from device-specific settings
					if (deviceSpecific.knownPrompts) {
						for (const knownPrompt of deviceSpecific.knownPrompts) {
							if (cleanBuffer.includes(knownPrompt)) {
								LoggingUtils.log(`Known Aruba OS prompt detected: ${knownPrompt}`, verbose);
								return true;
							}
						}
					}
				}

				// For Aruba APs specifically
				if (isArubaApDevice) {
					// Aruba APs often send character-by-character output and end with patterns like "hallway-2-655-ap# "
					const lines = cleanBuffer.split('\n');
					const lastLine = lines.length > 0 ? lines[lines.length - 1].trim() : '';
					// Check for AP-specific prompt patterns - but ensure we have command content first
					const hasCommandContent = cleanBuffer.includes('\n') && cleanBuffer.length > 50;
					if (hasCommandContent &&
						(/\S+-ap#\s*$/.test(cleanBuffer) || // Pattern like "hallway-2-655-ap# "
							/\S+-ap#\s*$/.test(lastLine) ||
							lastLine.endsWith('-ap#') ||
							/ap#\s*$/.test(lastLine) ||
							/instant#\s*$/.test(lastLine))) {
						LoggingUtils.log(`Aruba AP prompt detected: "${lastLine}" with ${cleanBuffer.length} chars`, verbose);
						return true;
					}

					// For character-by-character output, check if we've had no data for a while and buffer ends with #
					const now = Date.now();
					const timeSinceLastData = now - lastDataReceived;
					const hasCommandOutput = cleanBuffer.length > 50; // Ensure we have substantial output before considering prompt
					if (timeSinceLastData > 1000 &&
						hasCommandOutput &&
						(cleanBuffer.endsWith('# ') || cleanBuffer.endsWith('#'))) {
						LoggingUtils.log(`Aruba AP prompt detected after ${timeSinceLastData}ms pause with ${cleanBuffer.length} chars`, verbose);
						return true;
					}

					// Look for known AP prompts from device-specific settings
					if (deviceSpecific.knownPrompts) {
						for (const knownPrompt of deviceSpecific.knownPrompts) {
							if (cleanBuffer.includes(knownPrompt) || lastLine.includes(knownPrompt)) {
								LoggingUtils.log(`Known Aruba AP prompt detected: ${knownPrompt}`, verbose);
								return true;
							}
						}
					}
				}

				// For Aruba CX specifically
				if (isArubaDevice) {
					// Match patterns like "hostname# " at the end or "hostname# \r\n"
					const arubaPromptPattern = /\S+#\s+(?:\r\n)?$/;
					if (arubaPromptPattern.test(cleanBuffer)) {
						LoggingUtils.log('Aruba prompt detected with specific pattern', verbose);
						return true;
					}
					// For Aruba, also check if the prompt appears anywhere in the last line
					const lines = cleanBuffer.split('\n');
					const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';
					if (lastLine.includes('# ')) {
						LoggingUtils.log(`Aruba prompt detected in last line: ${lastLine}`, verbose);
						return true;
					}
				}

				// Regular case: Check against provided regex on both original and cleaned buffer
				if (promptRegex.test(buffer) || promptRegex.test(cleanBuffer)) {
					LoggingUtils.log(`Prompt detected with specified pattern: ${promptRegex}`, verbose);
					return true;
				}

				// Fallback patterns for different device types - check both buffers
				const fallbackPatterns = [
					/\S+#\s*(?:\r\n)?$/, // Hostname followed by # and optional space, may end with \r\n
					/\S+[#>$]\s*$/, // Any text ending with #, >, or $
					/\w+-\w+-\w+#\s*/, // Pattern like 'host-switch-1#'
					/#\s*$/, // Just a # at the end of the line
					/>\s*$/, // Just a > at the end of the line
					/\$\s*$/, // Just a $ at the end of the line
				];

				for (const pattern of fallbackPatterns) {
					if (pattern.test(buffer) || pattern.test(cleanBuffer)) {
						LoggingUtils.log(`Prompt detected with fallback pattern: ${pattern}`, verbose);
						return true;
					}
				}

				// For MAC address table commands, check for end-of-table pattern
				if (isMacAddressTable) {
					// Check if we have a large amount of MAC address entries
					const macAddressCount = (cleanBuffer.match(/:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}/g) || []).length;
					// MAC tables can be very long - if we have a significant number of entries
					// and a pause in data received, consider the command complete
					if (macAddressCount > 15 && Date.now() - lastDataReceived > 2000) {
						LoggingUtils.log(`MAC address table seems complete with ${macAddressCount} entries and no new data`, verbose);
						return true;
					}
				}

				// Check if we have stable output (no new data for a while)
				if (options?.stableOutputDetection && options?.lastDataTime) {
					const now = Date.now();
					const elapsed = now - options.lastDataTime;
					// For Aruba devices, use longer stable times due to slower character output
					let stableTime = 2000;
					if (isArubaOsDevice) {
						stableTime = 3600;
					} else if (isArubaApDevice) {
						stableTime = 2000;
					}
					if (elapsed > stableTime) {
						LoggingUtils.log(`Stable output detected after ${elapsed}ms of no new data`, verbose);
						return true;
					}
				}

				return false;
			};

			let lastDataTime = Date.now();
			const onDataInternal = (data: Buffer) => {
				const text = data.toString('utf8');
				buffer += text;
				lastDataReceived = Date.now();
				lastDataTime = Date.now();
				
				// Update last data time for stable output detection
				if (options?.stableOutputDetection) {
					options.lastDataTime = lastDataTime;
				}
				
				if (onData) onData(data);
				
				if (verbose) {
					LoggingUtils.log(`Received: ${JSON.stringify(text)}`, true);
				}
				
				LoggingUtils.analyzeBuffer(buffer, debugBuffer);

				// Check for prompt
				if (checkForPrompt(buffer)) {
					cleanup();
					resolve();
				}
			};

			const onError = (err: any) => {
				cleanup();
				reject(err);
			};

			const timer = setTimeout(() => {
				LoggingUtils.analyzeBuffer(buffer, debugBuffer);
				// Check for stable output
				const now = Date.now();
				const elapsed = now - lastDataTime;
				// For Aruba devices, use longer stable times due to slower character output
				let stableTime = 2000;
				if (isArubaOsDevice) {
					stableTime = 3600;
				} else if (isArubaApDevice) {
					stableTime = 2000;
				}
				if (elapsed > stableTime) {
					LoggingUtils.log(`No data received for ${elapsed}ms, considering command complete`, verbose);
					cleanup();
					resolve();
					return;
				}

				// Enhanced Aruba OS detection on timeout
				if (isArubaOsDevice) {
					// Clean buffer and check for specific patterns
					const cleanBuffer = buffer.replace(/\x1B\[\??\d*(?:[;\d]*)?[A-Za-z]/g, '');
					// Check for known Aruba OS patterns
					const lines = cleanBuffer.split('\n');
					const lastLine = lines.length > 0 ? lines[lines.length - 1].trim() : '';
					if (lastLine === '>' ||
						lastLine.endsWith('>') ||
						lastLine === '#' ||
						lastLine.endsWith('#')) {
						LoggingUtils.log(`Found Aruba prompt character in last line: "${lastLine}" - accepting as complete`, verbose);
						cleanup();
						resolve();
						return;
					}
					// If we have any content and timing out, consider it good enough for Aruba OS
					if (cleanBuffer.length > 0 && elapsed > 2000) {
						LoggingUtils.log(`Timeout with content for Aruba OS - accepting as complete after ${elapsed}ms`, verbose);
						cleanup();
						resolve();
						return;
					}
				}

				// Timing out, send a carriage return as a last resort to stimulate output
				LoggingUtils.log('Sending CR as last resort to stimulate output', verbose);
				try { stream.write('\r\n'); } catch {}
				// Give it a moment to respond before giving up
				setTimeout(() => {
					LoggingUtils.analyzeBuffer(buffer, debugBuffer);
					cleanup();
					reject(new Error('Timeout waiting for prompt match. Buffer remains unrecognized.'));
				}, 1500);
			}, timeoutMs);

			const cleanup = () => {
				clearTimeout(timer);
				try { stream.removeListener('data', onDataInternal); } catch {}
				try { stream.removeListener('error', onError); } catch {}
			};

			stream.on('data', onDataInternal);
			stream.on('error', onError);

			// Check if prompt is already in the buffer with updated function
			// For Aruba APs, don't immediately assume prompt is ready - wait for actual command execution
			if (!isArubaApDevice && checkForPrompt(buffer)) {
				LoggingUtils.analyzeBuffer(buffer, debugBuffer);
				LoggingUtils.log('Prompt already in buffer', verbose);
				cleanup();
				resolve();
			} else if (isArubaApDevice && buffer.length > 100 && checkForPrompt(buffer)) {
				// For Aruba APs, only consider prompt ready if we have substantial content
				LoggingUtils.analyzeBuffer(buffer, debugBuffer);
				LoggingUtils.log(`Aruba AP prompt already in buffer with ${buffer.length} chars`, verbose);
				cleanup();
				resolve();
			}
		});
	}

	/**
	 * Remove echoed command and trailing prompt from output with enhanced ANSI cleanup
	 */
	static cleanCommandOutput(
		rawOutput: string, 
		command: string, 
		promptRegex: RegExp, 
		options?: {
			deviceType?: string;
			verbose?: boolean;
		}
	): string {
		// If the output is empty already, return it
		if (!rawOutput || !rawOutput.trim()) {
			return '';
		}

		try {
			const verbose = options?.verbose || false;
			const isArubaOsDevice = options?.deviceType === 'aruba-os';
			const isArubaDevice = options?.deviceType === 'aruba';
			const isArubaApDevice = options?.deviceType === 'aruba-ap';

			// Detect if this is MAC address table output for special handling
			const isMacAddressTable = command === 'show mac-address' ||
				command.includes('mac-address') ||
				/[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}\s+\w+\s+\d+/.test(rawOutput);

			if (verbose) {
				const debugOutput = rawOutput.length > 100
					? `${rawOutput.substring(0, 50)}...${rawOutput.substring(rawOutput.length - 50)}`
					: rawOutput;
				LoggingUtils.log(`Cleaning output: ${JSON.stringify(debugOutput)}`, true);
			}

			// First, remove ANSI escape sequences that are common in Aruba output
			let cleanOutput = rawOutput;

			// More aggressive ANSI sequence removal - this is key for Aruba OS
			cleanOutput = cleanOutput.replace(/\x1B\[\??\d*(?:[;\d]*)?[A-Za-z]/g, '');
			// Remove additional terminal control sequences
			cleanOutput = cleanOutput.replace(/\x1B\[[0-9;]*[HfABCDEFGJKST]/g, '');
			cleanOutput = cleanOutput.replace(/\x1B\[[0-9]*[ABCDEFGHJKLMPQRST]/g, '');
			cleanOutput = cleanOutput.replace(/\x1B\=[0-9]*[a-z]/g, '');

			// For Aruba specific cleanup
			if (isArubaDevice || isArubaOsDevice || isArubaApDevice) {
				// Remove ESC character and its related sequences
				cleanOutput = cleanOutput.replace(/\x1B./g, '');
				// Remove cursor positioning and other special commands
				cleanOutput = cleanOutput.replace(/\x1B\[\d+;\d+[Hf]/g, '');
				cleanOutput = cleanOutput.replace(/\x1B\[\d*[JK]/g, '');
				// Clean specific sequences seen in the debug output
				cleanOutput = cleanOutput.replace(/\x1B\[[?]\d+[hlm]/g, '');
				// Remove \u001b sequences that appear in the debug output
				cleanOutput = cleanOutput.replace(/\u001b/g, '');

				// For Aruba APs, remove banner/MOTD content specifically
				if (isArubaApDevice) {
					// Remove the tech-support banner message
					cleanOutput = cleanOutput.replace(/show tech-support and show tech-support supplemental are the two most useful outputs to collect for any kind of troubleshooting session\.\s*/g, '');
					// Remove excessive blank lines at the beginning that come from banner
					cleanOutput = cleanOutput.replace(/^[\r\n\s]*/, '');
					// Remove any lines that are just prompts without command output
					const lines = cleanOutput.split('\n');
					const filteredLines = lines.filter((line) => {
						const trimmedLine = line.trim();
						// Keep lines that have actual content, not just prompts or blank lines
						return (trimmedLine &&
							!trimmedLine.match(/^[a-zA-Z0-9-]+#\s*$/) &&
							!trimmedLine.match(/^\s*$/) &&
							trimmedLine !== '');
					});
					cleanOutput = filteredLines.join('\n');
				}
			}

			// Special handling for MAC address table output
			if (isMacAddressTable) {
				// Make sure we remove the Status and Counters header that often appears
				cleanOutput = cleanOutput.replace(/Status and Counters - Port Address Table\s*\r?\n/g, '');
				// Clean any row header lines
				cleanOutput = cleanOutput.replace(/Port\s+Address\s+MAC Address\s+VLAN\s*/g, '');
				// Remove --MORE-- pagination markers from the output
				cleanOutput = cleanOutput.replace(/--MORE--\s*\r?\n?/g, '');
				// Make the MAC address table data more readable (one entry per line)
				cleanOutput = cleanOutput.replace(/\r/g, '');
				// If we're just getting MAC addresses, we can return already
				if (verbose) {
					LoggingUtils.log(`MAC address table cleaned with ${cleanOutput.length} bytes`, true);
				}
				return cleanOutput.trim();
			}

			// Escape special regex characters in the command
			const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

			// Aruba OS specific cleaning
			if (isArubaOsDevice) {
				// Remove the command echo and any repeated command
				const commandPattern = new RegExp(`^.*?${escapedCommand}.*?(\\r?\\n|$)`, 'm');
				const commandMatch = commandPattern.exec(cleanOutput);
				if (commandMatch) {
					// Only remove the first match (the echo of the sent command)
					cleanOutput = cleanOutput.substring(commandMatch[0].length);
				}
				// Aruba OS often includes pagination markers, remove them
				cleanOutput = cleanOutput.replace(/--MORE--\s*\r?\n?/g, '');
				cleanOutput = cleanOutput.replace(/--MORE--.*\r?\s+\r?\n/g, '\n');
				// Clean login banners and other pre-command outputs
				cleanOutput = cleanOutput.replace(/Your previous successful login.*\r?\n/g, '');
				// Remove hostname repeats (common in Aruba OS output)
				cleanOutput = cleanOutput.replace(/\S+#\s*\r?\n+\S+#/g, '');
				// Find and remove the trailing prompt
				const promptMatches = cleanOutput.match(/\S+[#>]\s*$/);
				if (promptMatches) {
					cleanOutput = cleanOutput.substring(0, promptMatches.index);
				}
				// Remove extra blank lines
				cleanOutput = cleanOutput.replace(/\r?\n\s*\r?\n/g, '\n');
			} else {
				// Regular command echo removal for other devices
				const commandPattern = new RegExp(`.*?${escapedCommand}.*?(\\r?\\n|$)`, 'm');
				const commandMatch = commandPattern.exec(cleanOutput);
				if (commandMatch) {
					// Only remove the first match (the echo of the sent command)
					cleanOutput = cleanOutput.substring(commandMatch[0].length);
				}
			}

			// Try to find the host prompt at the end
			const promptPattern = promptRegex;
			const promptMatch = promptPattern.exec(cleanOutput);
			// If we found the prompt at the end, remove it
			if (promptMatch && promptMatch.index > cleanOutput.length - 30) {
				cleanOutput = cleanOutput.substring(0, promptMatch.index);
			}

			// Also remove any trailing prompts that match common patterns
			const trailingPromptPatterns = [
				/\S+#\s*$/, // hostname#
				/\S+>\s*$/, // hostname>
				/\S+\$\s*$/, // hostname$
				/\w+-\w+-\w+#\s*$/, // Specific pattern like host-switch-1#
				/\(config\)[#>]\s*$/, // Config mode
				/\(config-if\)[#>]\s*$/, // Interface config mode
				/\(config-vlan\)[#>]\s*$/, // VLAN config mode
				/#\s*$/, // Just a #
				/>\s*$/, // Just a >
			];

			for (const pattern of trailingPromptPatterns) {
				const match = pattern.exec(cleanOutput);
				if (match && match.index > cleanOutput.length - 30) {
					cleanOutput = cleanOutput.substring(0, match.index);
				}
			}

			// Remove extra line breaks at the beginning and end
			cleanOutput = cleanOutput.replace(/^\s*\r?\n+/, '');
			cleanOutput = cleanOutput.replace(/\r?\n+\s*$/, '');

			if (verbose) {
				LoggingUtils.log(`Output length after cleaning: ${cleanOutput.length}`, true);
			}

			return cleanOutput;
		} catch (error) {
			// If any error occurs during cleaning, return the raw output
			console.error('Error cleaning command output:', error);
			return rawOutput;
		}
	}

	/**
	 * Handle privilege escalation for network devices
	 */
	static async handlePrivilegeEscalation(
		stream: any,
		enablePassword: string,
		promptRegex: RegExp,
		passwordPromptRegex: RegExp,
		timeoutMs: number,
		verbose?: boolean,
	): Promise<void> {
		if (verbose) console.log('Handling privilege escalation');
		
		// Send enable command
		stream.write('enable\r\n');
		await new Promise(resolve => setTimeout(resolve, 400));
		
		// Wait for password prompt
		await this.waitForPrompt(stream, passwordPromptRegex, timeoutMs);
		
		// Send enable password
		stream.write(`${enablePassword}\r\n`);
		await new Promise(resolve => setTimeout(resolve, 600));
		
		// Wait for privileged prompt
		await this.waitForPrompt(stream, promptRegex, timeoutMs);
		
		if (verbose) console.log('Privilege escalation completed');
	}
}
