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
				required: true,
				testedBy: 'superSshConnectionTest',
			},
		],
		properties: [
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
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						resource: ['command'],
						operation: ['executeMultiple'],
					},
				},
				default: {},
				options: [
					{
						name: 'commandItem',
						displayName: 'Command',
						values: [
							{
								displayName: 'Command',
								name: 'command',
								type: 'string',
								default: '',
								description: 'Command to execute',
							},
							{
								displayName: 'Working Directory',
								name: 'cwd',
								type: 'string',
								default: '/',
								description: 'Working directory for the command',
							},
							{
								displayName: 'Timeout',
								name: 'timeout',
								type: 'number',
								default: 30000,
								description: 'Command timeout in milliseconds',
							},
						],
					},
				],
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
				default: '/',
				required: true,
				description: 'Working directory for the command',
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
				placeholder: '',
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
		const credentials = await this.getCredentials('superSshCredentials');
		const advancedOptions = this.getNodeParameter('advancedOptions', 0, {}) as IDataObject;

		// Validate credentials
		const authMethod = credentials.authMethod as string || 'password';
		validateSshParams(
			credentials.host as string,
			credentials.username as string,
			parseInt(credentials.port as string, 10),
			authMethod,
			credentials.password as string,
			credentials.privateKey as string,
		);

		// Build SSH configuration
		const sshConfig = buildSshConfig(
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

		const ssh = new NodeSSH();

		try {
			// Connect to SSH server
			await ssh.connect(sshConfig);

			// Log connection
			const connectionSummary = generateConnectionSummary(
				credentials.host as string,
				credentials.username as string,
				parseInt(credentials.port as string, 10),
				authMethod,
				credentials.connectionType as string,
			);
			this.logger.info(connectionSummary);

			for (let i = 0; i < items.length; i++) {
				try {
					if (resource === 'command') {
						await SuperSsh.handleCommandExecution(this, ssh, i, operation, returnItems);
					} else if (resource === 'file') {
						await SuperSsh.handleFileOperations(this, ssh, i, operation, items, returnItems);
					} else if (resource === 'networkDevice') {
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
			const cwd = await resolveHomeDir.call(
				executeFunctions,
				executeFunctions.getNodeParameter('cwd', itemIndex) as string,
				ssh,
				itemIndex,
			);

			const result = await ssh.execCommand(command, { cwd });
			
			const output = parseSshOutput(result.stdout);
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.command = command;
			output.cwd = cwd;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'executeMultiple') {
			const commands = executeFunctions.getNodeParameter('commands', itemIndex) as IDataObject;
			const commandItems = commands.commandItem as IDataObject[];
			const results = [];

			for (const cmdItem of commandItems) {
				const command = cmdItem.command as string;
				const cwd = cmdItem.cwd as string || '/';

				const result = await ssh.execCommand(command, { cwd });
				const output = parseSshOutput(result.stdout);
				output.stderr = result.stderr;
				output.exitCode = result.code || 0;
				output.command = command;
				output.cwd = cwd;

				results.push(output);
			}

			returnItems.push({
				json: { commands: results },
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'executeSudo') {
			const command = executeFunctions.getNodeParameter('command', itemIndex) as string;
			const cwd = await resolveHomeDir.call(
				executeFunctions,
				executeFunctions.getNodeParameter('cwd', itemIndex) as string,
				ssh,
				itemIndex,
			);
			const sudoPassword = executeFunctions.getNodeParameter('sudoPassword', itemIndex) as string;

			const sudoCommand = `echo '${sudoPassword}' | sudo -S ${command}`;
			const result = await ssh.execCommand(sudoCommand, { cwd });
			
			const output = parseSshOutput(result.stdout);
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.command = command;
			output.cwd = cwd;
			output.sudo = true;

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
			} finally {
				await cleanup();
			}

			returnItems.push({
				json: {
					success: true,
					path: finalPath,
					message: 'File uploaded successfully',
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
			const output = parseSshOutput(result.stdout);
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.path = path;

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

		if (operation === 'getVersion') {
			const result = await ssh.execCommand(commands.showVersion);
			const output = parseSshOutput(result.stdout);
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.deviceType = deviceType as string;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'getRunningConfig') {
			const result = await ssh.execCommand(commands.showRunning);
			const output = parseSshOutput(result.stdout);
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.deviceType = deviceType as string;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'getInterfaces') {
			const result = await ssh.execCommand(commands.showInterfaces);
			const output = parseSshOutput(result.stdout);
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.deviceType = deviceType as string;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'customCommand') {
			const command = executeFunctions.getNodeParameter('customNetworkCommand', itemIndex) as string;
			const result = await ssh.execCommand(command);
			const output = parseSshOutput(result.stdout);
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;
			output.command = command;
			output.deviceType = deviceType as string;

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
		if (operation === 'getSystemInfo') {
			const result = await ssh.execCommand('uname -a');
			const output = parseSshOutput(result.stdout);
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'getDiskUsage') {
			const result = await ssh.execCommand('df -h');
			const output = parseSshOutput(result.stdout);
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'getMemoryInfo') {
			const result = await ssh.execCommand('free -h');
			const output = parseSshOutput(result.stdout);
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		} else if (operation === 'getProcessInfo') {
			const result = await ssh.execCommand('ps aux');
			const output = parseSshOutput(result.stdout);
			output.stderr = result.stderr;
			output.exitCode = result.code || 0;

			returnItems.push({
				json: output,
				pairedItem: { item: itemIndex },
			});
		}
	}
}
