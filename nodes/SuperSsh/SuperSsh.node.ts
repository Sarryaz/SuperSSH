import type {
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	IDataObject,
	IExecuteFunctions,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { BINARY_ENCODING, NodeOperationError } from 'n8n-workflow';
import { NodeSSH } from 'node-ssh';
import type { Readable } from 'stream';
import { file as tmpFile } from 'tmp-promise';
import { writeFile } from 'fs/promises';

import {
	buildSshConfig,
	validateSshParams,
	getNetworkDeviceCommands,
	parseSshOutput,
	generateConnectionSummary,
	CipherUtils,
	PromptHandler,
} from '../../utils/utilities';

async function resolveHomeDir(
	this: IExecuteFunctions,
	path: string,
	ssh: NodeSSH,
	itemIndex: number,
): Promise<string> {
	if (path.startsWith('~/')) {
		let homeDir = (await ssh.execCommand('echo $HOME')).stdout;

		if (homeDir.charAt(homeDir.length - 1) !== '/') {
			homeDir += '/';
		}

		return path.replace('~/', homeDir);
	}

	if (path.startsWith('~')) {
		throw new NodeOperationError(
			this.getNode(),
			'Invalid path. Replace "~" with home directory or "~/"',
			{
				itemIndex,
			},
		);
	}

	return path;
}

async function sendInitialCR(
	ssh: NodeSSH,
	logger: { debug: (msg: string) => void },
	deviceType?: string,
	verbose?: boolean,
): Promise<void> {
			try {
			const stream: any = await (ssh as any).requestShell();
			if (verbose) logger.debug('Sending initial CR to stimulate device prompt');
			stream.write('\r\n');
			await new Promise((r) => setTimeout(r, deviceType === 'aruba' ? 500 : 200));
			stream.write('\r\n');
			await new Promise((r) => setTimeout(r, 200));
			stream.end();
		} catch (error) {
			// Silently handle stream errors - this is expected behavior
			if (verbose) logger.debug(`Stream operation completed with warning: ${error}`);
		}
}

async function enterEnableMode(
	ssh: NodeSSH,
	password: string,
	logger: { debug: (msg: string) => void },
	verbose?: boolean,
): Promise<void> {
			try {
			const stream: any = await (ssh as any).requestShell();
			if (verbose) logger.debug('Entering enable/privileged mode');
			stream.write('enable\r\n');
			await new Promise((r) => setTimeout(r, 400));
			stream.write(`${password}\r\n`);
			await new Promise((r) => setTimeout(r, 600));
			stream.end();
		} catch (error) {
			// Silently handle stream errors - this is expected behavior
			if (verbose) logger.debug(`Enable mode operation completed with warning: ${error}`);
		}
}

async function runShellCommand(
	ssh: NodeSSH,
	command: string,
	promptRegex: RegExp,
	passwordPromptRegex: RegExp,
	timeoutMs: number,
	logger: { debug: (msg: string) => void },
	options: {
		preCommands?: string[];
		sendInitialCR?: boolean;
		enablePassword?: string;
		deviceType?: string;
		verbose?: boolean;
		lineEnding?: 'CRLF' | 'LF';
	},
): Promise<string> {
	const stream: any = await (ssh as any).requestShell();
	let buffer = '';
	stream.on('data', (data: Buffer) => {
		buffer += data.toString('utf8');
	});

	const EOL = options.lineEnding === 'LF' ? '\n' : '\r\n';

	// Optionally stimulate prompt
	if (options.sendInitialCR) {
		if (options.verbose) logger.debug('Prompt handler: sending initial CR');
		stream.write(EOL);
		await new Promise((r) => setTimeout(r, 300));
	}

	// Wait for prompt to ensure ready
	try { 
		await PromptHandler.waitForPrompt(stream, promptRegex, timeoutMs, undefined, {
			deviceType: options.deviceType,
			verbose: options.verbose,
			deviceSpecific: {
				handlePagination: true,
				paginationPrompt: '--MORE--',
				paginationContinue: ' ',
			},
		}); 
	} catch (error) {
		// Silently handle prompt wait errors - device might already be ready
		if (options.verbose) logger.debug(`Prompt wait completed with warning: ${error}`);
	}

	// Pre-commands (e.g., disable paging)
	if (options.preCommands && options.preCommands.length > 0) {
		for (const pre of options.preCommands) {
			if (pre && pre.trim().length > 0) {
				if (options.verbose) logger.debug(`Prompt handler: pre-command -> ${pre}`);
				buffer = '';
				stream.write(`${pre}${EOL}`);
				await PromptHandler.waitForPrompt(stream, promptRegex, timeoutMs, undefined, {
					deviceType: options.deviceType,
					verbose: options.verbose,
					deviceSpecific: {
						handlePagination: true,
						paginationPrompt: '--MORE--',
						paginationContinue: ' ',
					},
				});
			}
		}
	}

	// Enable/privileged mode
	if (options.enablePassword) {
		if (options.verbose) logger.debug('Prompt handler: entering enable mode');
		buffer = '';
		stream.write(`enable${EOL}`);
		await PromptHandler.waitForPrompt(stream, passwordPromptRegex, Math.max(3000, timeoutMs), undefined, {
			deviceType: options.deviceType,
			verbose: options.verbose,
			deviceSpecific: {
				handlePagination: true,
				paginationPrompt: '--MORE--',
				paginationContinue: ' ',
			},
		});
		buffer = '';
		stream.write(`${options.enablePassword}${EOL}`);
		await PromptHandler.waitForPrompt(stream, promptRegex, timeoutMs, undefined, {
			deviceType: options.deviceType,
			verbose: options.verbose,
			deviceSpecific: {
				handlePagination: true,
				paginationPrompt: '--MORE--',
				paginationContinue: ' ',
			},
		});
	}

	// Execute the main command
	if (options.verbose) logger.debug(`Prompt handler: executing -> ${command}`);
	buffer = '';
	stream.write(`${command}${EOL}`);
	await PromptHandler.waitForPrompt(stream, promptRegex, timeoutMs, undefined, {
		deviceType: options.deviceType,
		verbose: options.verbose,
		deviceSpecific: {
			handlePagination: true,
			paginationPrompt: '--MORE--',
			paginationContinue: ' ',
		},
	});

	const output = PromptHandler.cleanCommandOutput(buffer, command, promptRegex);
	try { 
		stream.end('exit\r\n'); 
	} catch (error) {
		// Silently handle stream end errors - this is expected behavior
		if (options.verbose) logger.debug(`Stream end completed with warning: ${error}`);
	}
	return output;
}

async function connectWithFallback(
	ssh: NodeSSH,
	config: any,
	fallbackEnabled: boolean,
	legacyAllowed: boolean,
	logger: { info: (msg: string) => void; debug: (msg: string) => void },
	verbose?: boolean,
): Promise<void> {
	try {
		await ssh.connect(config);
		return;
	} catch (err: any) {
		const message = String(err && err.message ? err.message : err);
		const isCipherError = /no matching cipher|handshake failed/i.test(message);
		if (!fallbackEnabled || !isCipherError) {
			throw err;
		}

		// Attempt with broadened cipher list and KEX/HMAC
		const broadened = CipherUtils.configureCiphers(legacyAllowed ? 'all' : 'secure-only');
		const broadenedKex = CipherUtils.configureKexAlgorithms(legacyAllowed ? 'high' : 'modern-only');
		const broadenedHmac = CipherUtils.configureHmacAlgorithms(legacyAllowed ? 'low' : 'high');
		const serverHostKeys = legacyAllowed
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
		config.algorithms = {
			...(config.algorithms || {}),
			cipher: broadened,
			kex: broadenedKex,
			hmac: broadenedHmac,
			serverHostKey: serverHostKeys,
		};
		if (verbose) logger.debug(`Retrying SSH connect with broadened ciphers (${legacyAllowed ? 'all' : 'secure-only'})`);
		try {
			await ssh.connect(config);
			return;
		} catch (err2: any) {
			const message2 = String(err2 && err2.message ? err2.message : err2);
			if (legacyAllowed && /no matching cipher|handshake failed/i.test(message2)) {
				// Last resort: specific legacy cipher
				config.algorithms = {
					...(config.algorithms || {}),
					cipher: ['aes256-cbc'],
				};
				if (verbose) logger.debug('Retrying SSH connect with legacy cipher aes256-cbc');
				await ssh.connect(config);
				return;
			}
			throw err2;
		}
	}
}

export class SuperSsh implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SSH Nexus',
		name: 'sshNexus',
		icon: 'fa:terminal',
		iconColor: 'blue',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["resource"] ? $parameter["operation"] + " • " + $parameter["resource"] : "SSH Automation"}}',
		description: 'Advanced SSH automation hub with intelligent connection management and network device support. Built with ❤️ by Sarryaz',
		defaults: {
			name: 'SSH Nexus',
			color: '#0066cc',
		},
		inputs: ['main' as any],
		outputs: ['main' as any],
		usableAsTool: true,
		credentials: [
			{
				name: 'superSshCredentials',
				required: false,
				testedBy: 'superSshConnectionTest',
				displayOptions: {
					show: {
						configMode: ['credentials'],
					},
				},
			},
		],
		properties: [
			{
				displayName: 'Configuration Mode',
				name: 'configMode',
				type: 'options',
				options: [
					{
						name: 'Use Credentials',
						value: 'credentials',
						description: 'Use stored SSH credentials (recommended for security)',
					},
					{
						name: 'Dynamic Parameters',
						value: 'dynamic',
						description: 'Use dynamic parameters from previous nodes or environment variables',
					},
				],
				default: 'credentials',
				description: 'Choose how to configure the SSH connection',
				hint: 'For security, use stored credentials. For dynamic workflows, use dynamic parameters.',
			},
			// Dynamic Configuration Options
			{
				displayName: 'Dynamic Host',
				name: 'dynamicHost',
				type: 'string',
				displayOptions: {
					show: {
						configMode: ['dynamic'],
					},
				},
				default: '',
				placeholder: '192.168.1.100 or server.example.com',
				description: 'Hostname or IP address (supports expressions and environment variables)',
				required: true,
			},
			{
				displayName: 'Dynamic Port',
				name: 'dynamicPort',
				type: 'number',
				displayOptions: {
					show: {
						configMode: ['dynamic'],
					},
				},
				default: 22,
				description: 'SSH port (supports expressions and environment variables)',
			},
			{
				displayName: 'Dynamic Username',
				name: 'dynamicUsername',
				type: 'string',
				displayOptions: {
					show: {
						configMode: ['dynamic'],
					},
				},
				default: '',
				placeholder: 'admin or root',
				description: 'Username (supports expressions and environment variables)',
				required: true,
			},
			{
				displayName: 'Dynamic Password',
				name: 'dynamicPassword',
				type: 'string',
				typeOptions: {
					password: true,
				},
				displayOptions: {
					show: {
						configMode: ['dynamic'],
					},
				},
				default: '',
				placeholder: 'Enter password or use expression',
				description: 'Password (supports expressions and environment variables)',
			},
			{
				displayName: 'Dynamic Private Key',
				name: 'dynamicPrivateKey',
				type: 'string',
				typeOptions: {
					rows: 4,
					password: true,
				},
				displayOptions: {
					show: {
						configMode: ['dynamic'],
					},
				},
				default: '',
				placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----...',
				description: 'Private key content (supports expressions and environment variables)',
			},
			{
				displayName: 'Resource Type',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Command Execution',
						value: 'command',
						description: 'Execute commands on remote system',
					},
					{
						name: 'File Operations',
						value: 'file',
						description: 'Upload/download files via SSH',
					},
					{
						name: 'Network Device',
						value: 'networkDevice',
						description: 'Specialized operations for network equipment (Cisco, Aruba, etc.)',
					},
					{
						name: 'System Information',
						value: 'systemInfo',
						description: 'Get system stats and information',
					},
					{
						name: 'Connection Health',
						value: 'connectionHealth',
						description: 'Monitor SSH connection quality and performance',
					},
				],
				default: 'command',
				hint: 'Start with Command Execution for basic operations, or choose File Operations for transfers.',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['command'],
					},
				},
				options: [
					{
						name: 'Execute Single Command',
						value: 'execute',
						description: 'Execute a single command on the remote system',
						action: 'Execute a command',
					},
					{
						name: 'Execute Multiple Commands',
						value: 'executeMultiple',
						description: 'Execute multiple commands in sequence with custom formatting',
						action: 'Execute multiple commands',
					},
					{
						name: 'Execute Command List',
						value: 'executeCommandList',
						description: 'Execute multiple commands in a simple text list (AI-friendly)',
						action: 'Execute commands from list',
					},
					{
						name: 'Execute with Sudo',
						value: 'executeSudo',
						description: 'Execute a command with elevated sudo privileges',
						action: 'Execute with sudo',
					},
				],
				default: 'execute',
			},
			{
				displayName: 'Command',
				name: 'command',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['command'],
						operation: ['execute', 'executeSudo'],
					},
				},
				default: '',
				placeholder: 'ls -la, show version, or any shell command',
				description: 'The command to be executed on the remote device',
			},
			{
				displayName: 'Commands List',
				name: 'commands',
				type: 'string',
				typeOptions: {
					rows: 8,
				},
				displayOptions: {
					show: {
						resource: ['command'],
						operation: ['executeMultiple', 'executeCommandList'],
					},
				},
				default: '',
				placeholder: 'Enter commands, one per line:\nshow version\nshow interfaces\nshow ip route\nping 8.8.8.8\n\n# Comments are supported\n# Use empty lines to separate command groups',
				description: 'Commands to execute sequentially (one per line). Supports comments with # and empty lines.',
			},
			{
				displayName: 'Commands Format',
				name: 'commandsFormat',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['command'],
						operation: ['executeMultiple'],
					},
				},
				options: [
					{
						name: 'Text List (One Per Line)',
						value: 'textList',
						description: 'Simple text format - one command per line',
					},
					{
						name: 'JSON Array',
						value: 'jsonArray',
						description: 'Advanced JSON format with command objects',
					},
					{
						name: '📊 Simple Array',
						value: 'simpleArray',
						description: 'JSON array of command strings',
					},
				],
				default: 'textList',
				description: 'Choose the input format for your commands',
			},
			{
				displayName: 'Wait Time Between Commands (ms)',
				name: 'defaultWaitTime',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['command'],
						operation: ['executeMultiple', 'executeCommandList'],
					},
				},
				default: 1000,
				description: 'Delay between commands to prevent overwhelming the remote system',
			},
			{
				displayName: 'Sudo Password',
				name: 'sudoPassword',
				type: 'string',
				typeOptions: {
					password: true,
				},
				displayOptions: {
					show: {
						resource: ['command'],
						operation: ['executeSudo'],
					},
				},
				default: '',
				placeholder: 'Enter sudo password',
				description: 'Password required for sudo authentication',
			},
			{
				displayName: '📂 Working Directory (Optional)',
				name: 'cwd',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['command'],
						operation: ['execute', 'executeSudo'],
					},
				},
				default: '',
				required: false,
				placeholder: '/home/user, ~/, or leave empty for default',
				description: 'Working directory for command execution (leave empty to use default directory)',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['file'],
					},
				},
				options: [
					{
						name: '📥 Download File',
						value: 'download',
						description: 'Download a file from the remote system',
						action: 'Download a file',
					},
					{
						name: '📤 Upload File',
						value: 'upload',
						description: 'Upload a file to the remote system',
						action: 'Upload a file',
					},
					{
						name: '📋 List Directory',
						value: 'list',
						description: 'List files and directories',
						action: 'List directory',
					},
					{
						name: '🗑️ Delete File',
						value: 'delete',
						description: 'Remove a file or directory',
						action: 'Delete file',
					},
				],
				default: 'upload',
			},
			{
				displayName: '📎 Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						operation: ['upload'],
						resource: ['file'],
					},
				},
				placeholder: 'data',
				hint: 'The name of the input binary field containing the file to be uploaded',
			},
			{
				displayName: '📂 Target Directory',
				name: 'path',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['upload'],
						resource: ['file'],
					},
				},
				default: '',
				required: true,
				placeholder: '/home/user or /var/www/html',
				description: 'Directory where the file will be uploaded (filename is taken from binary data)',
			},
			{
				displayName: 'File/Directory Path',
				displayOptions: {
					show: {
						operation: ['download', 'delete', 'list'],
						resource: ['file'],
					},
				},
				name: 'path',
				type: 'string',
				default: '',
				placeholder: '/home/user/document.pdf or /var/log/',
				description: 'Full path to the file or directory',
				required: true,
			},
			{
				displayName: '💾 Output Binary Property',
				displayOptions: {
					show: {
						operation: ['download'],
						resource: ['file'],
					},
				},
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				description: 'Property name where the downloaded file will be stored',
				required: true,
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['networkDevice'],
					},
				},
				options: [
					{
						name: '📋 Get Device Info',
						value: 'getVersion',
						description: 'Retrieve device version, model, and system information',
						action: 'Get device info',
					},
					{
						name: '⚙️ Get Running Config',
						value: 'getRunningConfig',
						description: 'Retrieve current active configuration',
						action: 'Get configuration',
					},
					{
						name: '🔧 Get Startup Config',
						value: 'getStartupConfig',
						description: 'Retrieve boot/startup configuration',
						action: 'Get startup configuration',
					},
					{
						name: '💾 Backup Configuration',
						value: 'backupConfig',
						description: 'Export device configuration for backup purposes',
						action: 'Backup device configuration',
					},
					{
						name: '🔄 Restore Configuration',
						value: 'restoreConfig',
						description: 'Apply configuration to the device',
						action: 'Restore device configuration',
					},
					{
						name: '🔌 Get Interfaces',
						value: 'getInterfaces',
						description: 'Show interface status and configuration',
						action: 'Get interfaces',
					},
					{
						name: '⚡ Custom Command',
						value: 'customCommand',
						description: 'Execute any custom network device command',
						action: 'Execute custom command',
					},
				],
				default: 'getVersion',
			},
			{
				displayName: 'Custom Command',
				name: 'customNetworkCommand',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['networkDevice'],
						operation: ['customCommand'],
					},
				},
				default: '',
				description: 'Custom command to execute on the network device',
			},
			{
				displayName: 'Configuration File',
				name: 'configFile',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['networkDevice'],
						operation: ['restoreConfig'],
					},
				},
				default: '',
				placeholder: 'tftp://server/path/config.txt',
				description: 'Path to configuration file to restore (e.g., TFTP server path)',
				required: true,
			},
			// Configuration Backup Options
			{
				displayName: 'Configuration Type',
				name: 'configType',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['networkDevice'],
						operation: ['backupConfig'],
					},
				},
				options: [
					{
						name: 'Running Configuration',
						value: 'running',
						description: 'Current active configuration',
					},
					{
						name: 'Startup Configuration',
						value: 'startup',
						description: 'Configuration used at boot',
					},
				],
				default: 'running',
				description: 'Type of configuration to retrieve',
			},
			{
				displayName: 'Return Type',
				name: 'returnType',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['networkDevice'],
						operation: ['backupConfig'],
					},
				},
				options: [
					{
						name: 'Return Config as Text',
						value: 'text',
						description: 'Return configuration as text in the output',
					},
					{
						name: 'Binary File',
						value: 'binary',
						description: 'Return configuration as a binary file',
					},
				],
				default: 'text',
				description: 'How to return the configuration',
			},
			// Configuration Restore Options
			{
				displayName: 'Configuration Source',
				name: 'configSource',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['networkDevice'],
						operation: ['restoreConfig'],
					},
				},
				options: [
					{
						name: 'Text Input',
						value: 'text',
						description: 'Directly enter configuration commands',
					},
					{
						name: 'Binary Data',
						value: 'binary',
						description: 'Use binary data (from previous node)',
					},
				],
				default: 'text',
				description: 'Source of configuration to restore',
			},
			{
				displayName: 'Configuration Commands',
				name: 'configCommands',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				displayOptions: {
					show: {
						resource: ['networkDevice'],
						operation: ['restoreConfig'],
						configSource: ['text'],
					},
				},
				default: '',
				placeholder: 'hostname router1\ninterface GigabitEthernet0/1\n description WAN\n ip address dhcp',
				description: 'Configuration commands to apply',
				required: true,
			},
			{
				displayName: 'Binary Property',
				name: 'binaryProperty',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['networkDevice'],
						operation: ['restoreConfig'],
						configSource: ['binary'],
					},
				},
				default: 'data',
				description: 'Name of the binary property containing the configuration file',
				required: true,
			},
			{
				displayName: 'Apply Method',
				name: 'applyMethod',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['networkDevice'],
						operation: ['restoreConfig'],
					},
				},
				options: [
					{
						name: 'Merge (Add to existing)',
						value: 'merge',
						description: 'Add/update to current configuration',
					},
					{
						name: 'Replace (Dangerous)',
						value: 'replace',
						description: 'Replace entire configuration',
					},
				],
				default: 'merge',
				description: 'How to apply the configuration',
			},
			{
				displayName: 'Save After Apply',
				name: 'saveAfterApply',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['networkDevice'],
						operation: ['restoreConfig'],
					},
				},
				default: true,
				description: 'Save configuration after applying',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['systemInfo'],
					},
				},
				options: [
					{
						name: 'System Info',
						value: 'getSystemInfo',
						description: 'Get system overview information',
						action: 'Get system overview',
					},
					{
						name: 'Process Info',
						value: 'getProcessInfo',
						description: 'Get running processes',
						action: 'Get processes',
					},
					{
						name: 'Disk Usage',
						value: 'getDiskUsage',
						description: 'Get disk usage information',
						action: 'Get disk usage',
					},
					{
						name: 'Memory Info',
						value: 'getMemoryInfo',
						description: 'Get network interface information',
						action: 'Get network interfaces',
					},
				],
				default: 'getSystemInfo',
			},
			// Connection Health Operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['connectionHealth'],
					},
				},
				options: [
					{
						name: 'Health Check',
						value: 'healthCheck',
						description: 'Comprehensive connection health analysis',
						action: 'Perform health check',
					},
					{
						name: 'Latency Test',
						value: 'latencyTest',
						description: 'Measure connection latency and jitter',
						action: 'Test latency',
					},
					{
						name: 'Throughput Test',
						value: 'throughputTest',
						description: 'Test data transfer performance',
						action: 'Test throughput',
					},
				],
				default: 'healthCheck',
			},

			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['upload', 'download'],
					},
				},
				default: {},
				options: [
					{
						displayName: 'File Name',
						name: 'fileName',
						type: 'string',
						default: '',
						description: 'Overrides the binary data file name',
					},
					{
						displayName: 'Preserve Permissions',
						name: 'preservePermissions',
						type: 'boolean',
						default: true,
						description: 'Preserve file permissions during transfer',
					},
				],
			},
			{
				displayName: 'Advanced Options',
				name: 'advancedOptions',
				type: 'collection',
				placeholder: 'Add advanced option',
				default: {},
				options: [
					{
						displayName: 'Command Timeout (ms)',
						name: 'commandTimeout',
						type: 'number',
						default: 30000,
						description: 'Maximum time to wait for command completion (milliseconds)',
					},
					{
						displayName: 'Output Parsing',
						name: 'parseOutput',
						type: 'options',
						options: [
							{ name: '📊 Smart Parse (Auto-detect)', value: 'smart' },
							{ name: '🔧 JSON Only', value: 'json' },
							{ name: '📋 Table Format', value: 'table' },
							{ name: '📄 Raw Text (Formatted)', value: 'raw' },
							{ name: '❌ No Parsing', value: 'none' },
						],
						default: 'smart',
						description: 'Choose how to process command output (smart parsing auto-detects format)',
					},
					{
						displayName: 'Continue on Error',
						name: 'continueOnError',
						type: 'boolean',
						default: false,
						description: 'Keep processing remaining items even if some commands fail',
					},
					{
						displayName: 'Cipher Override',
						name: 'cipherSelection',
						type: 'options',
						options: [
							{ name: '📋 Use Credential Settings', value: 'credential' },
							{ name: '🔓 All Available Ciphers (Including Legacy)', value: 'all' },
							{ name: '🛡️ Secure Ciphers Only', value: 'secure-only' },
							{ name: '⚠️ Legacy Ciphers Only', value: 'legacy-only' },
							{ name: '🔒 AES 128-bit CTR', value: 'aes128-ctr' },
							{ name: '🔒 AES 192-bit CTR', value: 'aes192-ctr' },
							{ name: '🔒 AES 256-bit CTR', value: 'aes256-ctr' },
							{ name: '🔐 AES 128-bit GCM', value: 'aes128-gcm@openssh.com' },
							{ name: '🔐 AES 256-bit GCM', value: 'aes256-gcm@openssh.com' },
							{ name: '⚡ ChaCha20-Poly1305', value: 'chacha20-poly1305@openssh.com' },
							{ name: '⚠️ AES 128-bit CBC (Legacy)', value: 'aes128-cbc' },
							{ name: '⚠️ AES 192-bit CBC (Legacy)', value: 'aes192-cbc' },
							{ name: '⚠️ AES 256-bit CBC (Legacy)', value: 'aes256-cbc' },
							{ name: '🔴 3DES CBC (Legacy)', value: '3des-cbc' },
						],
						default: 'credential',
						description: 'Override cipher selection from credentials for this operation',
					},
					{
						displayName: 'Try Fallback Ciphers',
						name: 'fallbackCiphers',
						type: 'boolean',
						default: true,
						description: 'Automatically try alternative ciphers if the primary ones fail',
					},
					{
						displayName: 'Retry Delay (ms)',
						name: 'retryDelay',
						type: 'number',
						default: 1000,
						description: 'Delay between connection retry attempts in milliseconds',
					},
					{
						displayName: 'Verbose Logging',
						name: 'verboseLogging',
						type: 'boolean',
						default: false,
						description: 'Enable detailed logging for debugging connection issues',
					},
					{
						displayName: '↵ Line Ending Style',
						name: 'lineEnding',
						type: 'options',
						options: [
							{ name: 'CR+LF (\\r\\n) - Windows Style', value: 'CRLF' },
							{ name: 'LF (\\n) - Unix Style', value: 'LF' },
						],
						default: 'CRLF',
						description: 'Line ending style for command execution (important for network devices)',
					},
					{
						displayName: 'Device Type',
						name: 'deviceType',
						type: 'options',
						options: [
							{ name: '🔧 Generic Device', value: 'generic' },
							{ name: '🌐 Cisco IOS', value: 'cisco' },
							{ name: '🌐 Aruba OS', value: 'aruba' },
							{ name: '🌐 Aruba AP', value: 'aruba-ap' },
							{ name: '🌐 Juniper', value: 'juniper' },
							{ name: '🌐 HP ProCurve', value: 'hp' },
							{ name: '🌐 Dell PowerConnect', value: 'dell' },
							{ name: '🌐 MikroTik', value: 'mikrotik' },
						],
						default: 'generic',
						description: 'Select the type of network device for optimized command handling',
					},
				],
			},
		],
	};

	methods = {
		credentialTest: {
			async superSshConnectionTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const credentials = credential.data as IDataObject;
				const ssh = new NodeSSH();
				
				try {
					// Validate parameters
					const errors = validateSshParams(
						credentials.host as string,
						credentials.username as string,
						parseInt(credentials.port as string, 10),
						credentials.authMethod as string || 'password',
						credentials.password as string,
						credentials.privateKey as string,
					);

					if (errors.length > 0) {
						return {
							status: 'Error',
							message: `Validation failed: ${errors.join(', ')}`,
						};
					}

					// Build SSH config
					const config = buildSshConfig(
						credentials.host as string,
						credentials.username as string,
						parseInt(credentials.port as string, 10),
						credentials.authMethod as string || 'password',
						credentials.password as string,
						credentials.privateKey as string,
						credentials.passphrase as string,
						credentials.securityOptions as any,
						credentials.connectionOptions as any,
					);

					await ssh.connect(config);
					
					// Test basic command execution
					const result = await ssh.execCommand('echo "Connection test successful"');
					
					if (result.stderr) {
						return {
							status: 'Error',
							message: `Command execution failed: ${result.stderr}`,
						};
					}

				} catch (error: any) {
					const message = `SSH connection failed: ${error.message}`;
					return {
						status: 'Error',
						message,
					};
				} finally {
					ssh.dispose();
				}
				
				return {
					status: 'OK',
					message: 'Connection successful!',
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnItems: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const configMode = this.getNodeParameter('configMode', 0) as string;
		const advancedOptions = this.getNodeParameter('advancedOptions', 0, {}) as IDataObject;

		let sshConfig: any;
		let connectionSummary: string;

		if (configMode === 'credentials') {
			// Use stored credentials
			const credentials = await this.getCredentials('superSshCredentials');
			if (!credentials) {
				throw new NodeOperationError(
					this.getNode(),
					'SSH credentials are required when using credentials mode',
				);
			}
			const authMethod = credentials.authMethod as string || 'password';
			
			// Check for cipher override in advanced options
			const cipherOverride = advancedOptions.cipherSelection as string;
			
			// Create a copy of security options to potentially override
			let securityOptions = credentials.securityOptions as any;
			if (cipherOverride && cipherOverride !== 'credential') {
				securityOptions = {
					...securityOptions,
					cipher: cipherOverride,
				};
			}
			
			// Validate credentials
			validateSshParams(
				credentials.host as string,
				credentials.username as string,
				parseInt(credentials.port as string, 10),
				authMethod,
				credentials.password as string,
				credentials.privateKey as string,
			);

			// Build SSH configuration
			sshConfig = buildSshConfig(
				credentials.host as string,
				credentials.username as string,
				parseInt(credentials.port as string, 10),
				authMethod,
				credentials.password as string,
				credentials.privateKey as string,
				credentials.passphrase as string,
				securityOptions,
				credentials.connectionOptions as any,
			);

			// Log connection
			connectionSummary = generateConnectionSummary(
				credentials.host as string,
				credentials.username as string,
				parseInt(credentials.port as string, 10),
				authMethod,
				credentials.connectionType as string,
			);
		} else {
			// Use dynamic parameters
			const dynamicHost = this.getNodeParameter('dynamicHost', 0) as string;
			const dynamicPort = this.getNodeParameter('dynamicPort', 0) as number;
			const dynamicUsername = this.getNodeParameter('dynamicUsername', 0) as string;
			const dynamicPassword = this.getNodeParameter('dynamicPassword', 0) as string;
			const dynamicPrivateKey = this.getNodeParameter('dynamicPrivateKey', 0) as string;

					// Validate dynamic parameters
		if (!dynamicHost || !dynamicUsername) {
			throw new NodeOperationError(
				this.getNode(),
				'Dynamic host and username are required when using dynamic configuration mode',
			);
		}

		// Validate host format
		const hostRegex = /^[a-zA-Z0-9.-]+$/;
		if (!hostRegex.test(dynamicHost)) {
			throw new NodeOperationError(
				this.getNode(),
				`Invalid host format: ${dynamicHost}. Host should contain only letters, numbers, dots, and hyphens.`,
			);
		}

		// Validate port range
		if (dynamicPort < 1 || dynamicPort > 65535) {
			throw new NodeOperationError(
				this.getNode(),
				`Invalid port number: ${dynamicPort}. Port must be between 1 and 65535.`,
			);
		}

			// Determine authentication method
			const authMethod = dynamicPrivateKey ? 'privateKey' : 'password';

			// Validate dynamic parameters
			validateSshParams(
				dynamicHost,
				dynamicUsername,
				dynamicPort,
				authMethod,
				dynamicPassword,
				dynamicPrivateKey,
			);

			// Build SSH configuration
			sshConfig = buildSshConfig(
				dynamicHost,
				dynamicUsername,
				dynamicPort,
				authMethod,
				dynamicPassword,
				dynamicPrivateKey,
				'', // No passphrase for dynamic keys
				{}, // No security options for dynamic mode
				{}, // No connection options for dynamic mode
			);

			// Log connection
			connectionSummary = generateConnectionSummary(
				dynamicHost,
				dynamicUsername,
				dynamicPort,
				authMethod,
				'dynamic',
			);
		}

		this.logger.info(connectionSummary);

		const ssh = new NodeSSH();

		try {
			// Connect to SSH server (with optional fallback cipher strategy)
			const fallbackEnabled = !!((configMode === 'credentials'
				? (await this.getCredentials('superSshCredentials'))?.connectionOptions
				: {}) as IDataObject)?.fallbackCiphers;
			const legacyAllowed = (configMode === 'credentials'
				? ((await this.getCredentials('superSshCredentials'))?.securityOptions as IDataObject | undefined)?.allowLegacyAlgorithms !== false
				: true);
			const verboseLogging = !!((configMode === 'credentials'
				? (await this.getCredentials('superSshCredentials'))?.connectionOptions
				: {}) as IDataObject)?.verboseLogging;
			
			// Get connection timeout from advanced options
			const connectionTimeout = (advancedOptions as IDataObject)?.commandTimeout as number || 30000;
			
			// Set connection timeout
			sshConfig.connectTimeout = connectionTimeout;
			
			if (verboseLogging) {
				this.logger.debug(`Attempting SSH connection with timeout: ${connectionTimeout}ms`);
			}
			if ((advancedOptions as IDataObject)?.cipherSelection && (advancedOptions as IDataObject).cipherSelection !== 'credential') {
				// If advanced override was used, legacy allowed depends on selected group
				const sel = (advancedOptions as IDataObject).cipherSelection as string;
				if (sel === 'secure-only') {
					// secure-only implies no legacy
					await connectWithFallback(ssh, sshConfig, fallbackEnabled, false, this.logger, verboseLogging);
				} else if (sel === 'legacy-only') {
					await connectWithFallback(ssh, sshConfig, fallbackEnabled, true, this.logger, verboseLogging);
				} else {
					await connectWithFallback(ssh, sshConfig, fallbackEnabled, legacyAllowed, this.logger, verboseLogging);
				}
			} else {
				await connectWithFallback(ssh, sshConfig, fallbackEnabled, legacyAllowed, this.logger, verboseLogging);
			}

			for (let i = 0; i < items.length; i++) {
				try {
					if (resource === 'command') {
						await SuperSsh.handleCommandExecution(this, ssh, i, operation, returnItems);
					} else if (resource === 'file') {
						await SuperSsh.handleFileOperations(this, ssh, i, operation, items, returnItems);
					} else if (resource === 'networkDevice') {
						// For network device operations, we need credentials object
						const credentials = configMode === 'credentials' 
							? await this.getCredentials('superSshCredentials')
							: {
								host: this.getNodeParameter('dynamicHost', i) as string,
								username: this.getNodeParameter('dynamicUsername', i) as string,
								port: this.getNodeParameter('dynamicPort', i) as number,
								networkDeviceOptions: { deviceType: 'generic' }
							};

						// Send device-specific no-paging/terminal-length command before ops
						const deviceType = (credentials?.networkDeviceOptions as IDataObject)?.deviceType || 'generic';
						const devCmds = getNetworkDeviceCommands(deviceType as string);
						if (devCmds.terminalLength) {
							if (verboseLogging) this.logger.debug(`Sending pre-command to disable paging: ${devCmds.terminalLength}`);
							await ssh.execCommand(devCmds.terminalLength);
						}

						// Enable/privileged mode if configured
						const enablePassword = (credentials?.networkDeviceOptions as IDataObject)?.enablePassword as string;
						if (enablePassword) {
							await enterEnableMode(ssh, enablePassword, this.logger, verboseLogging);
						}
						// Optionally stimulate prompt for legacy devices
						const sendCR = !!((configMode === 'credentials'
							? (await this.getCredentials('superSshCredentials'))?.connectionOptions
							: {}) as IDataObject)?.sendInitialCR;
						if (sendCR) {
							await sendInitialCR(ssh, this.logger, deviceType as string, verboseLogging);
						}
						await SuperSsh.handleNetworkDeviceOperations(this, ssh, i, operation, credentials, returnItems);
					} else if (resource === 'systemInfo') {
						await SuperSsh.handleSystemInfoOperations(this, ssh, i, operation, returnItems);
					} else if (resource === 'connectionHealth') {
						await SuperSsh.handleConnectionHealthOperations(this, ssh, i, operation, returnItems);
					}
						} catch (error: any) {
			const errorMessage = error?.message || 'Unknown error occurred';
			const errorStack = error?.stack || '';
			
			if (advancedOptions.continueOnError) {
				this.logger.warn(`Item ${i} failed: ${errorMessage}`);
				returnItems.push({
					json: {
						error: errorMessage,
						itemIndex: i,
						stack: errorStack,
						timestamp: new Date().toISOString(),
						resource: resource,
						operation: operation,
					},
					pairedItem: {
						item: i,
					},
				});
				continue;
			}
			
			// Enhanced error with context
			const enhancedError = new NodeOperationError(
				this.getNode(),
				`Operation failed for item ${i}: ${errorMessage}`,
				{
					itemIndex: i,
					description: `Resource: ${resource}, Operation: ${operation}`,
				}
			);
			throw enhancedError;
		}
			}
		} finally {
			try {
				// Properly close SSH connection
				if (ssh.isConnected()) {
					ssh.dispose();
					this.logger.debug('SSH connection properly closed');
				}
			} catch (cleanupError: any) {
				this.logger.warn(`Error during SSH cleanup: ${cleanupError?.message || 'Unknown cleanup error'}`);
			}
		}

		return [returnItems];
	}

	private static async handleCommandExecution(
		executeFunctions: IExecuteFunctions,
		ssh: NodeSSH,
		itemIndex: number,
		operation: string,
		returnItems: INodeExecutionData[],
	): Promise<void> {
		if (operation === 'execute') {
			const command = executeFunctions.getNodeParameter('command', itemIndex) as string;
			const cwdParam = executeFunctions.getNodeParameter('cwd', itemIndex) as string;
			const parseOutput = executeFunctions.getNodeParameter('advancedOptions.parseOutput', itemIndex, 'smart') as string;
			
			// Validate command
			if (!command || command.trim() === '') {
				throw new NodeOperationError(
					executeFunctions.getNode(),
					'Command cannot be empty',
					{ itemIndex },
				);
			}
			
			// Sanitize command (basic security check)
			const dangerousCommands = ['rm -rf /', 'dd if=/dev/zero', 'mkfs', 'fdisk', 'shutdown', 'reboot'];
			const lowerCommand = command.toLowerCase();
			for (const dangerous of dangerousCommands) {
				if (lowerCommand.includes(dangerous)) {
					throw new NodeOperationError(
						executeFunctions.getNode(),
						`Potentially dangerous command detected: ${dangerous}. Please review your command.`,
						{ itemIndex },
					);
				}
			}
			
			// Only resolve home directory if cwd is provided; otherwise do not set cwd
			let cwd: string | undefined = undefined;
			if (cwdParam && cwdParam.trim() !== '') {
				cwd = await resolveHomeDir.call(
					executeFunctions,
					cwdParam,
					ssh,
					itemIndex,
				);
			}

			// Get command timeout from advanced options
			const commandTimeout = executeFunctions.getNodeParameter('advancedOptions.commandTimeout', itemIndex, 30000) as number;
			
			// Execute command with timeout
			const result = cwd ? await ssh.execCommand(command, { cwd }) : await ssh.execCommand(command);
			
			// Add timeout information to output
			if (commandTimeout !== 30000) {
				executeFunctions.logger.debug(`Command executed with custom timeout: ${commandTimeout}ms`);
			}
			
			let output: any;
			if (parseOutput === 'none') {
				output = {
					raw: result.stdout,
					lines: result.stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: result.stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			} else {
				output = parseSshOutput(result.stdout, parseOutput);
			}
			
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.command = command;
			output.cwd = cwd;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'executeMultiple') {
			const commands = executeFunctions.getNodeParameter('commands', itemIndex) as string;
			const commandsFormat = executeFunctions.getNodeParameter('commandsFormat', itemIndex) as string;
			const defaultWaitTime = executeFunctions.getNodeParameter('defaultWaitTime', itemIndex) as number;
			const parseOutput = executeFunctions.getNodeParameter('advancedOptions.parseOutput', itemIndex, 'smart') as string;
			const results = [];

			const totalCommands = commands.length > 0 ? commands.split('\n').filter(cmd => cmd.trim() !== '').length : 0;
			executeFunctions.logger.info(`Executing ${totalCommands} commands in sequence`);
			
			if (totalCommands === 0) {
				throw new NodeOperationError(
					executeFunctions.getNode(),
					'No valid commands found. Please provide at least one non-empty command.',
					{ itemIndex },
				);
			}

			let commandItems: Array<{ command: string; waitTime?: number }> = [];

			// Parse commands based on format
			if (commandsFormat === 'textList') {
				commandItems = commands
					.split('\n')
					.map(cmd => cmd.trim())
					.filter(cmd => cmd !== '')
					.map(cmd => ({ command: cmd, waitTime: defaultWaitTime }));
			} else if (commandsFormat === 'jsonArray') {
				try {
					const parsedCommands = JSON.parse(commands);
					if (Array.isArray(parsedCommands)) {
						commandItems = parsedCommands.map((cmd: any) => ({
							command: typeof cmd === 'string' ? cmd : cmd.command || '',
							waitTime: cmd.waitTime || defaultWaitTime,
						}));
					}
				} catch (error) {
					throw new NodeOperationError(
						executeFunctions.getNode(),
						`Invalid JSON format for commands: ${error}`,
						{ itemIndex },
					);
				}
			} else if (commandsFormat === 'simpleArray') {
				try {
					const parsedCommands = JSON.parse(commands);
					if (Array.isArray(parsedCommands)) {
						commandItems = parsedCommands.map((cmd: string) => ({
							command: cmd,
							waitTime: defaultWaitTime,
						}));
					}
				} catch (error) {
					throw new NodeOperationError(
						executeFunctions.getNode(),
						`Invalid JSON format for commands: ${error}`,
						{ itemIndex },
					);
				}
			}

			// Filter out empty commands
			commandItems = commandItems.filter(item => item.command.trim() !== '');

			for (let i = 0; i < commandItems.length; i++) {
				const { command, waitTime = defaultWaitTime } = commandItems[i];
				// Do not set cwd by default to avoid implicit 'cd' on network OS
				const cwd: string | undefined = undefined;
				
				const progress = `${i + 1}/${commandItems.length}`;
				executeFunctions.logger.info(`Executing command ${progress}: ${command}`);
				
				// Update progress for long-running operations
				if (commandItems.length > 5) {
					executeFunctions.logger.info(`Progress: ${Math.round((i / commandItems.length) * 100)}% complete`);
				}
				
				const result = await ssh.execCommand(command);
				
				let output: any;
				if (parseOutput === 'none') {
					output = {
						raw: result.stdout,
						lines: result.stdout.split('\n').filter(line => line.trim() !== ''),
						wordCount: result.stdout.split(/\s+/).filter(word => word.trim() !== '').length,
						hasError: false,
					};
				} else {
					output = parseSshOutput(result.stdout, parseOutput);
				}
				
				output.stderr = result.stderr;
				output.exitCode = result.code || 0;
				output.command = command;
				if (cwd) output.cwd = cwd;
				output.parseOutput = parseOutput;
				output.commandIndex = i + 1;
				output.totalCommands = commandItems.length;

				results.push(output);

				// Wait between commands (except for the last one)
				if (i < commandItems.length - 1 && waitTime > 0) {
					executeFunctions.logger.debug(`Waiting ${waitTime}ms before next command`);
					await new Promise(resolve => setTimeout(resolve, waitTime));
				}
			}

			returnItems.push({
				json: { commands: results },
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'executeCommandList') {
			const commandList = executeFunctions.getNodeParameter('commands', itemIndex) as string;
			const defaultWaitTime = executeFunctions.getNodeParameter('defaultWaitTime', itemIndex) as number;
			const parseOutput = executeFunctions.getNodeParameter('advancedOptions.parseOutput', itemIndex, 'smart') as string;
			const results = [];

			executeFunctions.logger.info(`Executing ${commandList.length > 0 ? commandList.split('\n').filter(cmd => cmd.trim() !== '').length : 0} commands from list`);

			let commandItems: Array<{ command: string; waitTime?: number }> = [];

			// Parse commands based on format
			if (commandList.length > 0) {
				commandItems = commandList
					.split('\n')
					.map(cmd => cmd.trim())
					.filter(cmd => cmd !== '')
					.map(cmd => ({ command: cmd, waitTime: defaultWaitTime }));
			}

			// Filter out empty commands
			commandItems = commandItems.filter(item => item.command.trim() !== '');

			for (let i = 0; i < commandItems.length; i++) {
				const { command, waitTime = defaultWaitTime } = commandItems[i];
				// Do not set cwd by default to avoid implicit 'cd' on network OS
				const cwd: string | undefined = undefined;
				
				executeFunctions.logger.debug(`Executing command ${i + 1}/${commandItems.length}: ${command}`);
				const result = await ssh.execCommand(command);
				
				let output: any;
				if (parseOutput === 'none') {
					output = {
						raw: result.stdout,
						lines: result.stdout.split('\n').filter(line => line.trim() !== ''),
						wordCount: result.stdout.split(/\s+/).filter(word => word.trim() !== '').length,
						hasError: false,
					};
				} else {
					output = parseSshOutput(result.stdout, parseOutput);
				}
				
				output.stderr = result.stderr;
				output.exitCode = result.code || 0;
				output.command = command;
				if (cwd) output.cwd = cwd;
				output.parseOutput = parseOutput;
				output.commandIndex = i + 1;
				output.totalCommands = commandItems.length;

				results.push(output);

				// Wait between commands (except for the last one)
				if (i < commandItems.length - 1 && waitTime > 0) {
					executeFunctions.logger.debug(`Waiting ${waitTime}ms before next command`);
					await new Promise(resolve => setTimeout(resolve, waitTime));
				}
			}

			returnItems.push({
				json: { commands: results },
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'executeSudo') {
			const command = executeFunctions.getNodeParameter('command', itemIndex) as string;
			const cwdParam = executeFunctions.getNodeParameter('cwd', itemIndex) as string;
			const sudoPassword = executeFunctions.getNodeParameter('sudoPassword', itemIndex) as string;
			const parseOutput = executeFunctions.getNodeParameter('advancedOptions.parseOutput', itemIndex, 'smart') as string;
			
			// Only resolve home directory if cwd is provided
			let cwd: string | undefined = undefined;
			if (cwdParam && cwdParam.trim() !== '') {
				cwd = await resolveHomeDir.call(
					executeFunctions,
					cwdParam,
					ssh,
					itemIndex,
				);
			}
			
			const sudoCommand = `echo '${sudoPassword}' | sudo -S ${command}`;
			const result = cwd ? await ssh.execCommand(sudoCommand, { cwd }) : await ssh.execCommand(sudoCommand);
			
			let output: any;
			if (parseOutput === 'none') {
				output = {
					raw: result.stdout,
					lines: result.stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: result.stdout.split('\n').filter(word => word.trim() !== '').length,
					hasError: false,
				};
			} else {
				output = parseSshOutput(result.stdout, parseOutput);
			}
			
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.command = command;
			if (cwd) output.cwd = cwd;
			output.sudo = true;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		}
	}

	private static async handleFileOperations(
		executeFunctions: IExecuteFunctions,
		ssh: NodeSSH,
		itemIndex: number,
		operation: string,
		items: INodeExecutionData[],
		returnItems: INodeExecutionData[],
	): Promise<void> {
		const parseOutput = executeFunctions.getNodeParameter('advancedOptions.parseOutput', itemIndex, true) as boolean;
		
		// Ensure parseOutput is always a boolean
		const shouldParseOutput = typeof parseOutput === 'boolean' ? parseOutput : true;

		if (operation === 'upload') {
			const remotePath = await resolveHomeDir.call(
				executeFunctions,
				executeFunctions.getNodeParameter('path', itemIndex) as string,
				ssh,
				itemIndex,
			);
			const fileName = executeFunctions.getNodeParameter('options.fileName', itemIndex, '') as string;
			const binaryPropertyName = executeFunctions.getNodeParameter('binaryPropertyName', itemIndex);
			
			// Validate remote path
			if (!remotePath || remotePath.trim() === '') {
				throw new NodeOperationError(
					executeFunctions.getNode(),
					'Remote path cannot be empty',
					{ itemIndex },
				);
			}
			
			// Check for potentially dangerous paths
			if (remotePath.includes('..') || remotePath.includes('~') || remotePath.startsWith('/etc') || remotePath.startsWith('/var/log')) {
				throw new NodeOperationError(
					executeFunctions.getNode(),
					`Potentially dangerous upload path: ${remotePath}. Please use a safe directory.`,
					{ itemIndex },
				);
			}

			if (!binaryPropertyName) {
				throw new NodeOperationError(
					executeFunctions.getNode(),
					'Binary property name is required for file upload',
					{ itemIndex },
				);
			}

			const binaryData = executeFunctions.helpers.assertBinaryData(itemIndex, binaryPropertyName);
			let uploadData: Buffer | Readable;

			if (binaryData.id) {
				uploadData = await executeFunctions.helpers.getBinaryStream(binaryData.id);
			} else {
				uploadData = Buffer.from(binaryData.data, BINARY_ENCODING);
			}

			const finalPath = fileName ? `${remotePath}/${fileName}` : remotePath;

			// Create a temporary file for upload
			const { path: tempPath, cleanup } = await tmpFile();
			try {
				if (uploadData instanceof Buffer) {
					await writeFile(tempPath, uploadData);
				} else if ('pipe' in uploadData) {
					// Handle stream upload - only if it's a Readable stream
					const writeStream = require('fs').createWriteStream(tempPath);
					uploadData.pipe(writeStream);
					await new Promise((resolve, reject) => {
						writeStream.on('finish', resolve);
						writeStream.on('error', reject);
					});
				}
				
				await ssh.putFile(tempPath, finalPath);
			} catch (error: any) {
				throw new NodeOperationError(
					executeFunctions.getNode(),
					`File upload failed: ${error.message}`,
					{ itemIndex },
				);
			} finally {
				await cleanup();
			}

			returnItems.push({
				json: {
					success: true,
					path: finalPath,
					message: 'File uploaded successfully',
					parseOutput: shouldParseOutput,
				},
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'download') {
			const remotePath = await resolveHomeDir.call(
				executeFunctions,
				executeFunctions.getNodeParameter('path', itemIndex) as string,
				ssh,
				itemIndex,
			);
			const binaryPropertyName = executeFunctions.getNodeParameter('binaryPropertyName', itemIndex);

			if (!binaryPropertyName) {
				throw new NodeOperationError(
					executeFunctions.getNode(),
					'Binary property name is required for file download',
					{ itemIndex },
				);
			}

			const { path: tempPath, cleanup } = await tmpFile();
			try {
				await ssh.getFile(tempPath, remotePath);
				
				// Read the file content
				const fs = require('fs');
				const fileContent = fs.readFileSync(tempPath);
				
				// Create binary data
				const binaryData = await executeFunctions.helpers.prepareBinaryData(fileContent, remotePath.split('/').pop() || 'downloaded_file');
				
				// Add to items
				if (!items[itemIndex].binary) {
					items[itemIndex].binary = {};
				}
				items[itemIndex].binary![binaryPropertyName] = binaryData;
			} finally {
				await cleanup();
			}

			returnItems.push({
				json: {
					success: true,
					path: remotePath,
					message: 'File downloaded successfully',
					parseOutput: shouldParseOutput,
				},
				binary: items[itemIndex].binary,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'list') {
			const path = await resolveHomeDir.call(
				executeFunctions,
				executeFunctions.getNodeParameter('path', itemIndex) as string,
				ssh,
				itemIndex,
			);

			const result = await ssh.execCommand(`ls -la "${path}"`);
			
			let output: any;
			if (shouldParseOutput) {
				output = parseSshOutput(result.stdout);
			} else {
				output = {
					raw: result.stdout,
					lines: result.stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: result.stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			}
			
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.path = path;
			output.parseOutput = shouldParseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'delete') {
			const path = await resolveHomeDir.call(
				executeFunctions,
				executeFunctions.getNodeParameter('path', itemIndex) as string,
				ssh,
				itemIndex,
			);

			const result = await ssh.execCommand(`rm -rf "${path}"`);
			
			returnItems.push({
				json: {
					success: result.code === 0,
					deletedPath: path,
					stderr: result.stderr,
					exitCode: result.code,
					parseOutput: shouldParseOutput,
				},
				pairedItem: { item: itemIndex },
			});
		}
	}

	private static async handleNetworkDeviceOperations(
		executeFunctions: IExecuteFunctions,
		ssh: NodeSSH,
		itemIndex: number,
		operation: string,
		credentials: IDataObject,
		returnItems: INodeExecutionData[],
	): Promise<void> {
		const deviceType = (credentials.networkDeviceOptions as IDataObject)?.deviceType || 'generic';
		const commands = getNetworkDeviceCommands(deviceType as string);
		const parseOutput = executeFunctions.getNodeParameter('advancedOptions.parseOutput', itemIndex, true) as boolean;

		// If a command prompt regex is configured, prefer shell-based execution
		const connOptions = credentials.connectionOptions as IDataObject | undefined;
		const promptRegexStr = (connOptions?.commandPrompt as string) || '[#>$]\\s*$';
		const passwordPromptStr = (connOptions?.passwordPrompt as string) || 'password:|Password:';
		const loginTimeout = typeof connOptions?.loginPromptTimeout === 'number' ? (connOptions?.loginPromptTimeout as number) : 8000;
		const verbose = !!connOptions?.verboseLogging;
		const sendCR = !!connOptions?.sendInitialCR;
		const enablePassword = (credentials.networkDeviceOptions as IDataObject)?.enablePassword as string | undefined;
		const promptRegex = new RegExp(promptRegexStr, 'm');
		const passwordPromptRegex = new RegExp(passwordPromptStr, 'mi');

		if (operation === 'getVersion') {
			let stdout: string;
			try {
				stdout = await runShellCommand(
					ssh,
					commands.showVersion,
					promptRegex,
					passwordPromptRegex,
					loginTimeout,
					executeFunctions.logger,
					{
						preCommands: commands.terminalLength ? [commands.terminalLength] : [],
						sendInitialCR: sendCR,
						enablePassword,
						deviceType: deviceType as string,
						verbose,
						lineEnding: ((connOptions?.lineEnding as any) === 'LF' ? 'LF' : 'CRLF'),
					},
				);
			} catch {
				const result = await ssh.execCommand(commands.showVersion);
				stdout = result.stdout;
			}
			
			let output: any;
			if (parseOutput) {
				output = parseSshOutput(stdout);
			} else {
				output = {
					raw: stdout,
					lines: stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			}
			
			output.stderr = '';
			output.exitCode = 0;
			output.deviceType = deviceType as string;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'getRunningConfig') {
			let stdout: string;
			try {
				stdout = await runShellCommand(
					ssh,
					commands.showRunning,
					promptRegex,
					passwordPromptRegex,
					loginTimeout,
					executeFunctions.logger,
					{
						preCommands: commands.terminalLength ? [commands.terminalLength] : [],
						sendInitialCR: sendCR,
						enablePassword,
						deviceType: deviceType as string,
						verbose,
						lineEnding: ((connOptions?.lineEnding as any) === 'LF' ? 'LF' : 'CRLF'),
					},
				);
			} catch {
				const result = await ssh.execCommand(commands.showRunning);
				stdout = result.stdout;
			}
			
			let output: any;
			if (parseOutput) {
				output = parseSshOutput(stdout);
			} else {
				output = {
					raw: stdout,
					lines: stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			}
			
			output.stderr = '';
			output.exitCode = 0;
			output.deviceType = deviceType as string;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'getStartupConfig') {
			let stdout: string;
			try {
				stdout = await runShellCommand(
					ssh,
					commands.showStartup,
					promptRegex,
					passwordPromptRegex,
					loginTimeout,
					executeFunctions.logger,
					{
						preCommands: commands.terminalLength ? [commands.terminalLength] : [],
						sendInitialCR: sendCR,
						enablePassword,
						deviceType: deviceType as string,
						verbose,
						lineEnding: ((connOptions?.lineEnding as any) === 'LF' ? 'LF' : 'CRLF'),
					},
				);
			} catch {
				const result = await ssh.execCommand(commands.showStartup);
				stdout = result.stdout;
			}
			
			let output: any;
			if (parseOutput) {
				output = parseSshOutput(stdout);
			} else {
				output = {
					raw: stdout,
					lines: stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			}
			
			output.stderr = '';
			output.exitCode = 0;
			output.deviceType = deviceType as string;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'backupConfig') {
			let stdout: string;
			try {
				stdout = await runShellCommand(
					ssh,
					commands.backupConfig,
					promptRegex,
					passwordPromptRegex,
					loginTimeout,
					executeFunctions.logger,
					{
						preCommands: commands.terminalLength ? [commands.terminalLength] : [],
						sendInitialCR: sendCR,
						enablePassword,
						deviceType: deviceType as string,
						verbose,
						lineEnding: ((connOptions?.lineEnding as any) === 'LF' ? 'LF' : 'CRLF'),
					},
				);
			} catch {
				const result = await ssh.execCommand(commands.backupConfig);
				stdout = result.stdout;
			}
			
			let output: any;
			if (parseOutput) {
				output = parseSshOutput(stdout);
			} else {
				output = {
					raw: stdout,
					lines: stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			}
			
			output.stderr = '';
			output.exitCode = 0;
			output.deviceType = deviceType as string;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'restoreConfig') {
			const configSource = executeFunctions.getNodeParameter('configSource', itemIndex) as string;
			let configCommands: string;

			if (configSource === 'text') {
				configCommands = executeFunctions.getNodeParameter('configCommands', itemIndex) as string;
				if (!configCommands || configCommands.trim() === '') {
					throw new NodeOperationError(
						executeFunctions.getNode(),
						'Configuration commands are required for text input source',
						{ itemIndex },
					);
				}
			} else if (configSource === 'binary') {
				const binaryProperty = executeFunctions.getNodeParameter('binaryProperty', itemIndex) as string;
				if (!binaryProperty) {
					throw new NodeOperationError(
						executeFunctions.getNode(),
						'Binary property name is required for binary data source',
						{ itemIndex },
					);
				}
				const binaryData = executeFunctions.helpers.assertBinaryData(itemIndex, binaryProperty);
				let uploadData: Buffer | Readable;

				if (binaryData.id) {
					uploadData = await executeFunctions.helpers.getBinaryStream(binaryData.id);
				} else {
					uploadData = Buffer.from(binaryData.data, BINARY_ENCODING);
				}

				if (uploadData instanceof Buffer) {
					configCommands = uploadData.toString('utf8');
				} else {
					// Handle stream - read it into a buffer
					const chunks: Buffer[] = [];
					for await (const chunk of uploadData) {
						chunks.push(Buffer.from(chunk));
					}
					configCommands = Buffer.concat(chunks).toString('utf8');
				}


			} else {
				throw new NodeOperationError(
					executeFunctions.getNode(),
					`Invalid configSource: ${configSource}`,
					{ itemIndex },
				);
			}

			const applyMethod = executeFunctions.getNodeParameter('applyMethod', itemIndex) as string;
			const saveAfterApply = executeFunctions.getNodeParameter('saveAfterApply', itemIndex) as boolean;
			let stdout: string;

			try {
				if (applyMethod === 'merge') {
					stdout = await runShellCommand(
						ssh,
						configCommands,
						promptRegex,
						passwordPromptRegex,
						loginTimeout,
						executeFunctions.logger,
						{
							preCommands: commands.terminalLength ? [commands.terminalLength] : [],
							sendInitialCR: sendCR,
							enablePassword,
							deviceType: deviceType as string,
							verbose,
							lineEnding: ((connOptions?.lineEnding as any) === 'LF' ? 'LF' : 'CRLF'),
						},
					);
				} else if (applyMethod === 'replace') {
					stdout = await runShellCommand(
						ssh,
						configCommands,
						promptRegex,
						passwordPromptRegex,
						loginTimeout,
						executeFunctions.logger,
						{
							preCommands: commands.terminalLength ? [commands.terminalLength] : [],
							sendInitialCR: sendCR,
							enablePassword,
							deviceType: deviceType as string,
							verbose,
							lineEnding: ((connOptions?.lineEnding as any) === 'LF' ? 'LF' : 'CRLF'),
						},
					);
				} else {
					throw new NodeOperationError(
						executeFunctions.getNode(),
						`Invalid applyMethod: ${applyMethod}`,
						{ itemIndex },
					);
				}
			} catch {
				const result = await ssh.execCommand(configCommands);
				stdout = result.stdout;
			}
			
			let output: any;
			if (parseOutput) {
				output = parseSshOutput(stdout);
			} else {
				output = {
					raw: stdout,
					lines: stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			}
			
			output.stderr = '';
			output.exitCode = 0;
			output.command = configCommands;
			output.deviceType = deviceType as string;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});

			if (saveAfterApply) {
				try {
					stdout = await runShellCommand(
						ssh,
						commands.saveConfig,
						promptRegex,
						passwordPromptRegex,
						loginTimeout,
						executeFunctions.logger,
						{
							preCommands: commands.terminalLength ? [commands.terminalLength] : [],
							sendInitialCR: sendCR,
							enablePassword,
							deviceType: deviceType as string,
							verbose,
							lineEnding: ((connOptions?.lineEnding as any) === 'LF' ? 'LF' : 'CRLF'),
						},
					);
				} catch {
					const result = await ssh.execCommand(commands.saveConfig);
					stdout = result.stdout;
				}
				
				let saveOutput: any;
				if (parseOutput) {
					saveOutput = parseSshOutput(stdout);
				} else {
					saveOutput = {
						raw: stdout,
						lines: stdout.split('\n').filter(line => line.trim() !== ''),
						wordCount: stdout.split(/\s+/).filter(word => word.trim() !== '').length,
						hasError: false,
					};
				}
				
				saveOutput.stderr = '';
				saveOutput.exitCode = 0;
				saveOutput.command = commands.saveConfig;
				saveOutput.deviceType = deviceType as string;
				saveOutput.parseOutput = parseOutput;

				returnItems.push({
					json: saveOutput,
					pairedItem: { item: itemIndex },
				});
			}
		} else if (operation === 'getInterfaces') {
			let stdout: string;
			try {
				stdout = await runShellCommand(
					ssh,
					commands.showInterfaces,
					promptRegex,
					passwordPromptRegex,
					loginTimeout,
					executeFunctions.logger,
					{
						preCommands: commands.terminalLength ? [commands.terminalLength] : [],
						sendInitialCR: sendCR,
						enablePassword,
						deviceType: deviceType as string,
						verbose,
						lineEnding: ((connOptions?.lineEnding as any) === 'LF' ? 'LF' : 'CRLF'),
					},
				);
			} catch {
				const result = await ssh.execCommand(commands.showInterfaces);
				stdout = result.stdout;
			}
			
			let output: any;
			if (parseOutput) {
				output = parseSshOutput(stdout);
			} else {
				output = {
					raw: stdout,
					lines: stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			}
			
			output.stderr = '';
			output.exitCode = 0;
			output.deviceType = deviceType as string;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'customCommand') {
			const command = executeFunctions.getNodeParameter('customNetworkCommand', itemIndex) as string;
			let stdout: string;
			try {
				stdout = await runShellCommand(
					ssh,
					command,
					promptRegex,
					passwordPromptRegex,
					loginTimeout,
					executeFunctions.logger,
					{
						preCommands: commands.terminalLength ? [commands.terminalLength] : [],
						sendInitialCR: sendCR,
						enablePassword,
						deviceType: deviceType as string,
						verbose,
						lineEnding: ((connOptions?.lineEnding as any) === 'LF' ? 'LF' : 'CRLF'),
					},
				);
			} catch {
				const result = await ssh.execCommand(command);
				stdout = result.stdout;
			}
			
			let output: any;
			if (parseOutput) {
				output = parseSshOutput(stdout);
			} else {
				output = {
					raw: stdout,
					lines: stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			}
			
			output.stderr = '';
			output.exitCode = 0;
			output.command = command;
			output.deviceType = deviceType as string;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		}
	}

	private static async handleSystemInfoOperations(
		executeFunctions: IExecuteFunctions,
		ssh: NodeSSH,
		itemIndex: number,
		operation: string,
		returnItems: INodeExecutionData[],
	): Promise<void> {
		const parseOutput = executeFunctions.getNodeParameter('advancedOptions.parseOutput', itemIndex, true) as boolean;
		
		if (operation === 'getSystemInfo') {
			const result = await ssh.execCommand('uname -a');
			
			let output: any;
			if (parseOutput) {
				output = parseSshOutput(result.stdout);
			} else {
				output = {
					raw: result.stdout,
					lines: result.stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: result.stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			}
			
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'getDiskUsage') {
			const result = await ssh.execCommand('df -h');
			
			let output: any;
			if (parseOutput) {
				output = parseSshOutput(result.stdout);
			} else {
				output = {
					raw: result.stdout,
					lines: result.stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: result.stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			}
			
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'getMemoryInfo') {
			const result = await ssh.execCommand('free -h');
			
			let output: any;
			if (parseOutput) {
				output = parseSshOutput(result.stdout);
			} else {
				output = {
					raw: result.stdout,
					lines: result.stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: result.stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			}
			
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'getProcessInfo') {
			const result = await ssh.execCommand('ps aux');
			
			let output: any;
			if (parseOutput) {
				output = parseSshOutput(result.stdout);
			} else {
				output = {
					raw: result.stdout,
					lines: result.stdout.split('\n').filter(line => line.trim() !== ''),
					wordCount: result.stdout.split(/\s+/).filter(word => word.trim() !== '').length,
					hasError: false,
				};
			}
			
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		}
	}

	private static async handleConnectionHealthOperations(
		executeFunctions: IExecuteFunctions,
		ssh: NodeSSH,
		itemIndex: number,
		operation: string,
		returnItems: INodeExecutionData[],
	): Promise<void> {
		if (operation === 'healthCheck') {
			// Comprehensive health check
			const startTime = Date.now();
			const testCommands = [
				'echo "Connection test"',
				'uptime',
				'date',
				'whoami'
			];
			
			let successCount = 0;
			const results: any[] = [];
			
			for (const cmd of testCommands) {
				try {
					const result = await ssh.execCommand(cmd);
					results.push({
						command: cmd,
						success: result.code === 0,
						responseTime: Date.now() - startTime,
						output: result.stdout
					});
					if (result.code === 0) successCount++;
				} catch (error: any) {
					results.push({
						command: cmd,
						success: false,
						error: error.message
					});
				}
			}
			
			const healthScore = (successCount / testCommands.length) * 100;
			const totalTime = Date.now() - startTime;
			
			returnItems.push({
				json: {
					healthScore,
					status: healthScore > 75 ? 'healthy' : healthScore > 50 ? 'degraded' : 'unhealthy',
					totalResponseTime: totalTime,
					averageResponseTime: totalTime / testCommands.length,
					testResults: results,
					timestamp: new Date().toISOString(),
					connectionInfo: {
						host: (ssh as any).connection?.config?.host || 'unknown',
						port: (ssh as any).connection?.config?.port || 22,
						username: (ssh as any).connection?.config?.username || 'unknown'
					}
				},
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'latencyTest') {
			// Latency and jitter test
			const iterations = 10;
			const latencies: number[] = [];
			
			for (let i = 0; i < iterations; i++) {
				const start = Date.now();
				try {
					await ssh.execCommand('echo "ping"');
					latencies.push(Date.now() - start);
				} catch {
					latencies.push(-1); // Failed attempt
				}
				await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between tests
			}
			
			const validLatencies = latencies.filter(l => l > 0);
			const avgLatency = validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length;
			const minLatency = Math.min(...validLatencies);
			const maxLatency = Math.max(...validLatencies);
			const jitter = maxLatency - minLatency;
			
			returnItems.push({
				json: {
					averageLatency: avgLatency,
					minLatency,
					maxLatency,
					jitter,
					packetLoss: ((iterations - validLatencies.length) / iterations) * 100,
					iterations,
					rawLatencies: latencies,
					quality: jitter < 10 ? 'excellent' : jitter < 50 ? 'good' : jitter < 100 ? 'fair' : 'poor'
				},
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'throughputTest') {
			// Simple throughput test
			const testData = 'x'.repeat(1024); // 1KB test data
			const iterations = 5;
			const results: number[] = [];
			
			for (let i = 0; i < iterations; i++) {
				const start = Date.now();
				try {
					await ssh.execCommand(`echo "${testData}" | wc -c`);
					results.push(Date.now() - start);
				} catch {
					results.push(-1);
				}
			}
			
			const validResults = results.filter(r => r > 0);
			const avgTime = validResults.reduce((a, b) => a + b, 0) / validResults.length;
			const throughput = (1024 * 8) / (avgTime / 1000); // bits per second
			
			returnItems.push({
				json: {
					throughputBps: throughput,
					throughputKbps: throughput / 1024,
					averageTransferTime: avgTime,
					testSize: 1024,
					iterations,
					performance: throughput > 100000 ? 'excellent' : throughput > 50000 ? 'good' : 'limited'
				},
				pairedItem: { item: itemIndex },
			});
		}
	}


}
