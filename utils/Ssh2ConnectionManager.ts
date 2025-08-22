import { LoggingUtils } from './LoggingUtils';
import { CipherUtils } from './utilities';

// Try to import SSH2, but make it optional to avoid dependency conflicts
let Client: any;
let ssh2Available = false;
try {
	Client = require('ssh2').Client;
	ssh2Available = true;
} catch (error) {
	// SSH2 not available, create a stub
	Client = class StubClient {
		connect() {
			throw new Error('SSH2 not available - using node-ssh fallback');
		}
	};
	ssh2Available = false;
}

export interface Ssh2ConnectionOptions {
	host: string;
	port: number;
	username: string;
	password?: string;
	privateKey?: string;
	passphrase?: string;
	deviceType?: string;
	verboseLogging?: boolean;
	connectTimeout?: number;
	advancedSecurity?: {
		compatibilityLevel?: 'high' | 'medium' | 'low';
		securityLevel?: 'high' | 'medium' | 'low';
		allowLegacyAlgorithms?: boolean;
	};
	fallbackCiphers?: boolean;
	algorithms?: {
		cipher?: string[];
		kex?: string[];
		hmac?: string[];
		serverHostKey?: string[];
	};
}

export interface Ssh2ConnectionResult {
	client: any;
	algorithms: {
		cipher: string;
		kex: string;
		hmac: string;
		serverHostKey: string;
	};
}

/**
 * SSH2-based connection manager for enhanced cipher handling and retry logic
 */
export class Ssh2ConnectionManager {
	/**
	 * Create a new SSH2 client connection with enhanced algorithm configuration
	 */
	static async createConnection(options: Ssh2ConnectionOptions): Promise<Ssh2ConnectionResult> {
		if (!ssh2Available) {
			throw new Error('SSH2 client not available. Using node-ssh fallback.');
		}
		const conn = new Client();
		
		// Get compatibility settings with defaults
		const compatibilityLevel = options.advancedSecurity?.compatibilityLevel || 'medium';
		const securityLevel = options.advancedSecurity?.securityLevel || 'medium';
		const allowLegacyAlgorithms = options.advancedSecurity?.allowLegacyAlgorithms !== false;
		
		// For Aruba OS switches, we need higher compatibility
		if (options.deviceType === 'aruba-os') {
			LoggingUtils.log('Using high compatibility settings for Aruba OS switch', options.verboseLogging || false);
			// Override compatibility settings for Aruba OS
			options.advancedSecurity = {
				compatibilityLevel: 'high',
				securityLevel: 'low',
				allowLegacyAlgorithms: true,
			};
		}

		return new Promise((resolve, reject) => {
			const connectTimeout = setTimeout(() => {
				conn.end();
				reject(new Error(`Connection timeout after ${options.connectTimeout || 30000}ms`));
			}, options.connectTimeout || 30000);

			conn.on('ready', () => {
				clearTimeout(connectTimeout);
				LoggingUtils.log(`Successfully connected to ${options.host}:${options.port}`, options.verboseLogging || false);
				
				// Get the negotiated algorithms
				const session = (conn as any)._sock?.session;
				const algorithms = session ? {
					cipher: session.incoming.cipher || 'unknown',
					kex: session.incoming.kex || 'unknown',
					hmac: session.incoming.mac || 'unknown',
					serverHostKey: session.incoming.serverHostKey || 'unknown'
				} : {
					cipher: 'unknown',
					kex: 'unknown',
					hmac: 'unknown',
					serverHostKey: 'unknown'
				};

				resolve({ client: conn, algorithms });
			});

			conn.on('error', (err: Error) => {
				clearTimeout(connectTimeout);
				reject(err);
			});

			conn.on('keyboard-interactive', (name: string, instructions: string, lang: string, prompts: any[], finish: (responses: string[]) => void) => {
				LoggingUtils.log('Interactive auth detected', options.verboseLogging || false);
				// Handle keyboard-interactive authentication
				const responses: string[] = [];
				for (const prompt of prompts) {
					if (prompt.prompt.toLowerCase().includes('password')) {
						responses.push(options.password || '');
					} else {
						responses.push(''); // Empty response for non-password prompts
					}
				}
				finish(responses);
			});

			try {
				// Configure algorithms based on compatibility settings
				const kexAlgorithms = CipherUtils.configureKexAlgorithms(compatibilityLevel);
				const hmacAlgorithms = CipherUtils.configureHmacAlgorithms(securityLevel);
				
				// Determine if we're connecting with a single cipher or allowing multiple
				const cipherAlgorithms = options.fallbackCiphers
					? allowLegacyAlgorithms
						? CipherUtils.configureCiphers('all')
						: CipherUtils.configureCiphers('secure-only')
					: options.algorithms?.cipher || ['aes256-ctr'];

				// Server host key algorithms with proper typing
				let serverHostKeys = allowLegacyAlgorithms
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

				// For Aruba OS, we want to use the most compatible algorithms
				if (options.deviceType === 'aruba-os') {
					serverHostKeys = [
						'ssh-rsa',
						'ssh-dss',
						'ecdsa-sha2-nistp256',
						'ecdsa-sha2-nistp384',
						'ecdsa-sha2-nistp521',
					];
				}

				// Connect with enhanced algorithm options
				if (options.verboseLogging) {
					LoggingUtils.log(`Connecting with algorithms: ${JSON.stringify({
						cipher: cipherAlgorithms,
						kex: kexAlgorithms,
						hmac: hmacAlgorithms,
						serverHostKey: serverHostKeys,
					})}`, true);
				}

				const connectOptions: any = {
					host: options.host,
					port: options.port,
					username: options.username,
					algorithms: {
						cipher: cipherAlgorithms,
						kex: kexAlgorithms,
						hmac: hmacAlgorithms,
						serverHostKey: serverHostKeys,
					},
					tryKeyboard: true,
					readyTimeout: options.connectTimeout || 30000,
				};

				// Add authentication method
				if (options.privateKey) {
					connectOptions.privateKey = options.privateKey;
					if (options.passphrase) {
						connectOptions.passphrase = options.passphrase;
					}
				} else if (options.password) {
					connectOptions.password = options.password;
				}

				conn.connect(connectOptions);
			} catch (error) {
				reject(new Error(`Failed to configure SSH connection: ${(error as Error).message}`));
			}
		});
	}

	/**
	 * Create a shell stream from an SSH2 client with device-specific initialization
	 */
	static async createShell(client: any, options: {
		deviceType?: string;
		verboseLogging?: boolean;
		sendInitialCR?: boolean;
		terminalType?: string;
	}): Promise<any> {
		return new Promise((resolve, reject) => {
			// Define the shell options
			const shellOptions = {
				term: options.terminalType || 'vt100',
				rows: 24,
				cols: 80,
				modes: {
					ECHO: 1 as 0 | 1,
					TTY_OP_ISPEED: 115200,
					TTY_OP_OSPEED: 115200,
				},
			};

			client.shell(shellOptions, (err: Error | undefined, stream: any) => {
				if (err) {
					reject(new Error(`Failed to open shell: ${err.message}`));
					return;
				}

				// Set up error handler
				stream.on('error', (streamErr: Error) => {
					reject(new Error(`Shell stream error: ${streamErr.message}`));
				});

				// Initialize the shell with device-specific handling
				if (options.sendInitialCR) {
					LoggingUtils.log('Sending initial CR to stimulate prompt', options.verboseLogging || false);
					stream.write('\r\n');
					
					// Many devices need a small delay after connection before they're ready
					setTimeout(() => {
						// Send another CR and wait longer for Aruba switches
						stream.write('\r\n');
						
						// Add special handling for different Aruba switch types
						if (options.deviceType === 'aruba') {
							setTimeout(() => {
								// Send a harmless command to stimulate output
								stream.write(' \r\n');
								resolve(stream);
							}, 500);
						} else if (options.deviceType === 'aruba-os') {
							// Aruba OS might need a longer delay and multiple CR attempts
							setTimeout(() => {
								// Send a specific series of carriage returns for Aruba OS
								stream.write('\r\n');
								setTimeout(() => {
									// Send another CR - this helps with terminal negotiation
									stream.write('\r\n');
									setTimeout(() => {
										// Third CR often needed for Aruba OS
										stream.write('\r\n');
										setTimeout(() => {
											// Finally send the 'no pag' command to help with pagination
											stream.write('no pag\r\n');
											resolve(stream);
										}, 500);
									}, 500);
								}, 500);
							}, 1000);
						} else {
							resolve(stream);
						}
					}, 1000);
				} else {
					resolve(stream);
				}
			});
		});
	}

	/**
	 * Execute a command with retry logic and cipher fallback
	 */
	static async executeCommandWithRetry(
		options: Ssh2ConnectionOptions,
		command: string,
		retryCount: number = 3,
		retryDelay: number = 1000
	): Promise<{ output: string; algorithms: any }> {
		let lastError: Error | null = null;
		let attemptedCiphers: string[] = [];

		// Try with selected cipher(s) and retry logic
		for (let attempt = 0; attempt < retryCount; attempt++) {
			// If fallback ciphers is disabled, only use the first cipher
			const effectiveCiphers = options.fallbackCiphers 
				? (options.algorithms?.cipher || ['aes256-ctr'])
				: [options.algorithms?.cipher?.[0] || 'aes256-ctr'];

			for (const cipher of effectiveCiphers) {
				if (attemptedCiphers.includes(cipher)) continue;
				attemptedCiphers.push(cipher);

				try {
					LoggingUtils.log(`Attempt ${attempt + 1}, trying cipher: ${cipher}`, options.verboseLogging || false);
					
					// Update options with current cipher
					const currentOptions = { ...options, algorithms: { ...options.algorithms, cipher: [cipher] } };
					
					const result = await this.connectAndExecuteCommand(currentOptions, command);
					return result;
				} catch (error) {
					lastError = error as Error;
					LoggingUtils.error(`Connection failed with cipher ${cipher}: ${(error as Error).message}`, options.verboseLogging || false);
					
					// If it's just a cipher issue, continue trying others
					if ((error as Error).message.includes('no matching cipher found') ||
						(error as Error).message.includes('handshake failed')) {
						continue;
					}
					
					// For other errors, wait before retry
					await new Promise(resolve => setTimeout(resolve, retryDelay));
					break;
				}
			}
		}

		throw new Error(`Failed to connect after ${retryCount} attempts with ciphers [${attemptedCiphers.join(', ')}]. Last error: ${lastError?.message}`);
	}

	/**
	 * Connect and execute a single command
	 */
	private static async connectAndExecuteCommand(
		options: Ssh2ConnectionOptions,
		command: string
	): Promise<{ output: string; algorithms: any }> {
		let client: any | null = null;
		let stream: any = null;

		try {
			// Connect to the device
			const connectionResult = await this.createConnection(options);
			client = connectionResult.client;
			stream = await this.createShell(client, options);

			// Execute command
			let dataBuffer = '';
			let output = '';

			// Set up data handler
			if (stream) {
				stream.on('data', (data: Buffer) => {
					const text = data.toString('utf8');
					LoggingUtils.log(`Received: ${JSON.stringify(text)}`, options.verboseLogging || false);
					dataBuffer += text;
					output += text;
				});
			}

			// Send command
			if (stream) {
				LoggingUtils.log(`Sending command: ${command}`, options.verboseLogging || false);
				stream.write(`${command}\r\n`);
				
				// Wait for command completion (simplified for now)
				await new Promise(resolve => setTimeout(resolve, 2000));
			}

			return { output, algorithms: connectionResult.algorithms };
		} finally {
			// Clean up resources
			if (stream) {
				stream.end('exit\r\n');
			}
			if (client) {
				client.end();
			}
		}
	}
}
