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

export class SuperSsh implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Super SSH',
		name: 'superSsh',
		icon: 'fa:terminal',
		iconColor: 'blue',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Enhanced SSH operations with advanced security and network device support',
		defaults: {
			name: 'Super SSH',
			color: '#0066cc',
		},
		inputs: ['main' as any],
		outputs: ['main' as any],
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
						description: 'Use stored SSH credentials',
					},
					{
						name: 'Dynamic Parameters',
						value: 'dynamic',
						description: 'Use dynamic parameters from previous nodes or environment variables',
					},
				],
				default: 'credentials',
				description: 'Choose how to configure the SSH connection',
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
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Command',
						value: 'command',
						description: 'Execute commands on remote system',
					},
					{
						name: 'File',
						value: 'file',
						description: 'Upload/download files',
					},
					{
						name: 'Network Device',
						value: 'networkDevice',
						description: 'Specialized operations for network devices',
					},
					{
						name: 'System Info',
						value: 'systemInfo',
						description: 'Get system information',
					},
				],
				default: 'command',
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
						name: 'Execute',
						value: 'execute',
						description: 'Execute a command',
						action: 'Execute a command',
					},
					{
						name: 'Execute Multiple',
						value: 'executeMultiple',
						description: 'Execute multiple commands in sequence',
						action: 'Execute multiple commands',
					},
					{
						name: 'Execute with Sudo',
						value: 'executeSudo',
						description: 'Execute a command with sudo privileges',
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
				description: 'The command to be executed on the remote device',
			},
			{
				displayName: 'Commands',
				name: 'commands',
				type: 'string',
				typeOptions: {
					rows: 8,
				},
				displayOptions: {
					show: {
						resource: ['command'],
						operation: ['executeMultiple'],
					},
				},
				default: '',
				placeholder: 'Enter commands, one per line:\nls -la\npwd\necho "Hello World"',
				description: 'Commands to execute (one per line)',
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
				description: 'Password for sudo authentication',
			},
			{
				displayName: 'Working Directory',
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
				placeholder: '/home/user or ~/ (leave empty for root)',
				description: 'Working directory for the command (leave empty for root directory, use ~/ for home directory)',
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
						name: 'Download',
						value: 'download',
						description: 'Download a file',
						action: 'Download a file',
					},
					{
						name: 'Upload',
						value: 'upload',
						description: 'Upload a file',
						action: 'Upload a file',
					},
					{
						name: 'List Directory',
						value: 'list',
						description: 'List directory contents',
						action: 'List directory',
					},
					{
						name: 'Delete File',
						value: 'delete',
						description: 'Delete a file or directory',
						action: 'Delete file',
					},
				],
				default: 'upload',
			},
			{
				displayName: 'Input Binary Field',
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
				displayName: 'Target Directory',
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
				placeholder: '/home/user',
				description:
					'The directory to upload the file to. The name of the file does not need to be specified, it\'s taken from the binary data file name.',
			},
			{
				displayName: 'Path',
				displayOptions: {
					show: {
						operation: ['download', 'delete', 'list'],
						resource: ['file'],
					},
				},
				name: 'path',
				type: 'string',
				default: '',
				placeholder: '/home/user/invoice.txt',
				description: 'The file path for the operation',
				required: true,
			},
			{
				displayName: 'File Property',
				displayOptions: {
					show: {
						operation: ['download'],
						resource: ['file'],
					},
				},
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				description: 'Object property name which holds binary data',
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
						name: 'Get Device Info',
						value: 'getInfo',
						description: 'Get device information',
						action: 'Get device info',
					},
					{
						name: 'Get Configuration',
						value: 'getConfig',
						description: 'Get device configuration',
						action: 'Get configuration',
					},
					{
						name: 'Get Interfaces',
						value: 'getInterfaces',
						description: 'Get interface information',
						action: 'Get interfaces',
					},
					{
						name: 'Custom Command',
						value: 'customCommand',
						description: 'Execute custom network device command',
						action: 'Execute custom command',
					},
				],
				default: 'getInfo',
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
						name: 'System Overview',
						value: 'overview',
						description: 'Get system overview information',
						action: 'Get system overview',
					},
					{
						name: 'Process List',
						value: 'processes',
						description: 'Get running processes',
						action: 'Get processes',
					},
					{
						name: 'Disk Usage',
						value: 'diskUsage',
						description: 'Get disk usage information',
						action: 'Get disk usage',
					},
					{
						name: 'Network Interfaces',
						value: 'networkInterfaces',
						description: 'Get network interface information',
						action: 'Get network interfaces',
					},
				],
				default: 'overview',
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
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Command Timeout',
						name: 'commandTimeout',
						type: 'number',
						default: 30000,
						description: 'Timeout for command execution in milliseconds',
					},
					{
						displayName: 'Parse Output',
						name: 'parseOutput',
						type: 'boolean',
						default: true,
						description: 'Parse command output for structured data',
					},
					{
						displayName: 'Continue on Error',
						name: 'continueOnError',
						type: 'boolean',
						default: false,
						description: 'Continue execution even if individual commands fail',
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
				credentials.securityOptions as any,
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
			// Connect to SSH server
			await ssh.connect(sshConfig);

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
						await SuperSsh.handleNetworkDeviceOperations(this, ssh, i, operation, credentials, returnItems);
					} else if (resource === 'systemInfo') {
						await SuperSsh.handleSystemInfoOperations(this, ssh, i, operation, returnItems);
					}
				} catch (error: any) {
					if (advancedOptions.continueOnError) {
						returnItems.push({
							json: {
								error: error.message,
								itemIndex: i,
							},
							pairedItem: {
								item: i,
							},
						});
						continue;
					}
					throw error;
				}
			}
		} finally {
			ssh.dispose();
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
			const parseOutput = executeFunctions.getNodeParameter('advancedOptions.parseOutput', itemIndex, true) as boolean;
			
			// Only resolve home directory if cwd is provided
			let cwd = '/';
			if (cwdParam && cwdParam.trim() !== '') {
				cwd = await resolveHomeDir.call(
					executeFunctions,
					cwdParam,
					ssh,
					itemIndex,
				);
			}

			const result = await ssh.execCommand(command, { cwd });
			
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
			output.command = command;
			output.cwd = cwd;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'executeMultiple') {
			const commands = executeFunctions.getNodeParameter('commands', itemIndex) as string;
			const commandItems = commands.split('\n').map(cmd => cmd.trim()).filter(cmd => cmd !== '');
			const parseOutput = executeFunctions.getNodeParameter('advancedOptions.parseOutput', itemIndex, true) as boolean;
			const results = [];

			executeFunctions.logger.info(`Executing ${commandItems.length} commands in sequence`);

			for (const command of commandItems) {
				// No cwd for multiple commands - use default
				const cwd = '/';
				
				executeFunctions.logger.debug(`Executing command: ${command}`);
				const result = await ssh.execCommand(command, { cwd });
				
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
				output.command = command;
				output.cwd = cwd;
				output.parseOutput = parseOutput;

				results.push(output);
			}

			returnItems.push({
				json: { commands: results },
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'executeSudo') {
			const command = executeFunctions.getNodeParameter('command', itemIndex) as string;
			const cwdParam = executeFunctions.getNodeParameter('cwd', itemIndex) as string;
			const sudoPassword = executeFunctions.getNodeParameter('sudoPassword', itemIndex) as string;
			const parseOutput = executeFunctions.getNodeParameter('advancedOptions.parseOutput', itemIndex, true) as boolean;
			
			// Only resolve home directory if cwd is provided
			let cwd = '/';
			if (cwdParam && cwdParam.trim() !== '') {
				cwd = await resolveHomeDir.call(
					executeFunctions,
					cwdParam,
					ssh,
					itemIndex,
				);
			}
			
			const sudoCommand = `echo '${sudoPassword}' | sudo -S ${command}`;
			const result = await ssh.execCommand(sudoCommand, { cwd });
			
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
			output.command = command;
			output.cwd = cwd;
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

		if (operation === 'getVersion') {
			const result = await ssh.execCommand(commands.showVersion);
			
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
			output.deviceType = deviceType as string;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'getRunningConfig') {
			const result = await ssh.execCommand(commands.showRunning);
			
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
			output.deviceType = deviceType as string;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'getInterfaces') {
			const result = await ssh.execCommand(commands.showInterfaces);
			
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
			output.deviceType = deviceType as string;
			output.parseOutput = parseOutput;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'customCommand') {
			const command = executeFunctions.getNodeParameter('customNetworkCommand', itemIndex) as string;
			const result = await ssh.execCommand(command);
			
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
}
