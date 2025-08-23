import type { IExecuteFunctions, INodeType, INodeTypeDescription, IDataObject, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { TemplateManager } from './TemplateManager';
import { TextFsmEngine, type EngineOptions } from './TextFsmEngine';
import type { Template } from './types/template';
import { buildTemplateFromParams } from './TemplateBuilder';

export class SshTemplateParser implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SSH Template Parser',
		name: 'sshTemplateParser',
		icon: 'file:./icon.svg',
		group: ['transform'],
		version: 1,
		description: 'Parse network device output using TextFSM templates. Extract structured data from SSH command outputs with pre-built templates for Aruba, Cisco, and other vendors.',
		defaults: { name: 'SSH Template Parser' },
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Parse Output', value: 'parseOutput', description: 'Parse device output using a template' },
					{ name: 'Create Template', value: 'createTemplate', description: 'Create new template' },
					{ name: 'Upload Template', value: 'uploadTemplate', description: 'Upload template JSON' },
					{ name: 'Manage Templates', value: 'manageTemplates', description: 'List or delete templates' },
				],
				default: 'parseOutput',
			},
			// Parse Output
			{
				displayName: 'Vendor Filter',
				name: 'vendorFilter',
				type: 'options',
				displayOptions: { show: { operation: ['parseOutput'] } },
				options: [
					{ name: 'Any', value: 'any' },
					{ name: 'Aruba', value: 'aruba' },
					{ name: 'Cisco', value: 'cisco' },
					{ name: 'Juniper', value: 'juniper' },
					{ name: 'Generic', value: 'generic' },
				],
				default: 'any',
				description: 'Filter templates by vendor',
			},
			{
				displayName: 'Command Contains',
				name: 'commandFilter',
				type: 'string',
				displayOptions: { show: { operation: ['parseOutput'] } },
				default: '',
				description: 'Filter templates by command substring',
			},
			{
				displayName: 'Template',
				name: 'templateId',
				type: 'options',
				displayOptions: { show: { operation: ['parseOutput'] } },
				typeOptions: { loadOptionsMethod: 'getTemplates' },
				default: '',
				description: 'Template to use for parsing',
			},
			{
				displayName: 'Output Mode',
				name: 'outputMode',
				type: 'options',
				displayOptions: { show: { operation: ['parseOutput'] } },
				options: [
					{ name: 'Single Item (records array)', value: 'single' },
					{ name: 'Split Items (one per record)', value: 'split' },
				],
				default: 'single',
			},
			{
				displayName: 'Text Source',
				name: 'textSource',
				type: 'options',
				displayOptions: { show: { operation: ['parseOutput'] } },
				options: [
					{ name: 'Input Field', value: 'field' },
					{ name: 'JSON Path', value: 'jsonpath' },
					{ name: 'String', value: 'string' },
				],
				default: 'field',
			},
			{
				displayName: 'Field Name',
				name: 'fieldName',
				type: 'string',
				displayOptions: { show: { operation: ['parseOutput'], textSource: ['field'] } },
				default: 'data',
				description: 'Name of the input field containing text to parse',
			},
			{
				displayName: 'Field Path (dot notation)',
				name: 'fieldPath',
				type: 'string',
				displayOptions: { show: { operation: ['parseOutput'], textSource: ['jsonpath'] } },
				default: 'data.output',
			},
			{
				displayName: 'Input Text',
				name: 'inputText',
				type: 'string',
				typeOptions: { rows: 5 },
				displayOptions: { show: { operation: ['parseOutput'], textSource: ['string'] } },
				default: '',
			},
			{
				displayName: 'Enable Debug Trace',
				name: 'debug',
				type: 'boolean',
				displayOptions: { show: { operation: ['parseOutput'] } },
				default: false,
			},
			{
				displayName: 'Fail if No Match',
				name: 'failOnNoMatch',
				type: 'boolean',
				displayOptions: { show: { operation: ['parseOutput'] } },
				default: false,
				description: 'Throw an error if parsing yields zero records',
			},
			{
				displayName: 'Reset Fields On Emit (disable filldown)',
				name: 'resetOnEmit',
				type: 'boolean',
				displayOptions: { show: { operation: ['parseOutput'] } },
				default: false,
			},
			{
				displayName: 'Coerce Variable Types',
				name: 'coerceTypes',
				type: 'boolean',
				displayOptions: { show: { operation: ['parseOutput'] } },
				default: false,
				description: 'Use variable type info in template to coerce values',
			},

			// Create Template (form/json)
			{
				displayName: 'Template Source',
				name: 'templateSource',
				type: 'options',
				displayOptions: { show: { operation: ['createTemplate'] } },
				options: [
					{ name: 'Form', value: 'form' },
					{ name: 'JSON', value: 'json' },
				],
				default: 'form',
			},
			{
				displayName: 'Template Name',
				name: 'templateName',
				type: 'string',
				displayOptions: { show: { operation: ['createTemplate'], templateSource: ['form'] } },
				default: '',
				required: true,
			},
			{
				displayName: 'Vendor',
				name: 'vendor',
				type: 'options',
				displayOptions: { show: { operation: ['createTemplate'], templateSource: ['form'] } },
				options: [
					{ name: 'Aruba', value: 'aruba' },
					{ name: 'Cisco', value: 'cisco' },
					{ name: 'Juniper', value: 'juniper' },
					{ name: 'Generic', value: 'generic' },
				],
				default: 'aruba',
			},
			{
				displayName: 'Device OS',
				name: 'deviceOs',
				type: 'string',
				displayOptions: { show: { operation: ['createTemplate'], templateSource: ['form'] } },
				default: '',
			},
			{
				displayName: 'Command',
				name: 'command',
				type: 'string',
				displayOptions: { show: { operation: ['createTemplate'], templateSource: ['form'] } },
				default: '',
			},
			{
				displayName: 'States',
				name: 'states',
				type: 'fixedCollection',
				displayOptions: { show: { operation: ['createTemplate'], templateSource: ['form'] } },
				placeholder: 'Add State',
				default: {},
				options: [
					{
						name: 'state',
						displayName: 'State',
						values: [
							{ displayName: 'State Name', name: 'name', type: 'string', default: 'start', required: true },
							{
								displayName: 'Patterns',
								name: 'patterns',
								type: 'fixedCollection',
								placeholder: 'Add Pattern',
								default: {},
								options: [
									{
										name: 'pattern',
										displayName: 'Pattern',
										values: [
											{ displayName: 'Regex', name: 'regex', type: 'string', required: true, default: '' },
											{ displayName: 'Flags', name: 'flags', type: 'string', default: '' },
											{ displayName: 'Emit On Match', name: 'emit', type: 'boolean', default: true },
											{ displayName: 'Transition To', name: 'transitionTo', type: 'string', default: 'self' },
											{ displayName: 'Map (JSON)', name: 'map', type: 'string', default: '' },
										],
									},
								],
							},
						],
					},
				],
			},

			// Create/Upload Template via JSON
			{
				displayName: 'Template JSON',
				name: 'templateJson',
				type: 'string',
				typeOptions: { rows: 8 },
				displayOptions: { show: { operation: ['createTemplate', 'uploadTemplate'], templateSource: ['json'] } },
				default: '',
				description: 'Template definition as JSON',
			},

			// Manage Templates
			{
				displayName: 'Action',
				name: 'manageAction',
				type: 'options',
				displayOptions: { show: { operation: ['manageTemplates'] } },
				options: [
					{ name: 'List', value: 'list' },
					{ name: 'Delete', value: 'delete' },
				],
				default: 'list',
			},
			{
				displayName: 'Template to Delete',
				name: 'deleteId',
				type: 'string',
				displayOptions: { show: { operation: ['manageTemplates'], manageAction: ['delete'] } },
				default: '',
			},
		],
	};

	methods = {
		loadOptions: {
			async getTemplates(this: ILoadOptionsFunctions) {
				const mgr = new TemplateManager();
				await mgr.init();
				const templates = await mgr.list();
				const vendor = (this.getCurrentNodeParameter('vendorFilter') as string) || 'any';
				const cmd = ((this.getCurrentNodeParameter('commandFilter') as string) || '').toLowerCase();
				return templates
					.filter((t) => (vendor === 'any' ? true : t.vendor === (vendor as any)))
					.filter((t) => (cmd ? (t.command || '').toLowerCase().includes(cmd) : true))
					.map((t) => ({ name: `${t.vendor}:${t.name}`, value: t.id }));
			},
		},
	};

	async execute(this: IExecuteFunctions) {
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as string;
		const mgr = new TemplateManager();
		await mgr.init();
		const engine = new TextFsmEngine();

		if (operation === 'parseOutput') {
			const templateId = this.getNodeParameter('templateId', 0) as string;
			const template = await mgr.get(templateId);
			if (!template) throw new NodeOperationError(this.getNode(), `Template not found: ${templateId}`);

			const textSource = this.getNodeParameter('textSource', 0) as string;
			const fieldName = this.getNodeParameter('fieldName', 0, 'data') as string;
			const fieldPath = this.getNodeParameter('fieldPath', 0, 'data.output') as string;
			const inputTextParam = this.getNodeParameter('inputText', 0, '') as string;
			const outputMode = this.getNodeParameter('outputMode', 0, 'single') as string;
			const debug = this.getNodeParameter('debug', 0, false) as boolean;
			const failOnNoMatch = this.getNodeParameter('failOnNoMatch', 0, false) as boolean;
			const resetOnEmit = this.getNodeParameter('resetOnEmit', 0, false) as boolean;
			const coerceTypes = this.getNodeParameter('coerceTypes', 0, false) as boolean;

			const out: IDataObject[] = [];
			const getByPath = (obj: IDataObject, path: string): unknown => {
				const parts = path.split('.');
				let cur: unknown = obj;
				for (const p of parts) {
					if (cur && typeof cur === 'object' && p in (cur as any)) cur = (cur as any)[p];
					else return undefined;
				}
				return cur;
			};

			for (let i = 0; i < items.length; i += 1) {
				let text = '';
				if (textSource === 'string') {
					text = inputTextParam;
				} else if (textSource === 'field') {
					const data = items[i].json as IDataObject;
					const v = data[fieldName];
					text = typeof v === 'string' ? v : JSON.stringify(v ?? '');
				} else {
					const data = items[i].json as IDataObject;
					text = String(getByPath(data, fieldPath) ?? '');
				}
				const options: EngineOptions = { debug, resetOnEmit, coerceTypes };
				const result = engine.parseOutput(text, template as Template, options);
				if (failOnNoMatch && (!result.records || result.records.length === 0)) {
					throw new NodeOperationError(this.getNode(), 'No records parsed');
				}
				if (outputMode === 'split') {
					for (const rec of result.records) out.push(rec as unknown as IDataObject);
				} else {
					out.push({ result: result as unknown as IDataObject });
				}
			}
			return [out.map((o) => ({ json: o }))];
		}

		if (operation === 'createTemplate') {
			const source = this.getNodeParameter('templateSource', 0) as string;
			if (source === 'json') {
				const json = this.getNodeParameter('templateJson', 0) as string;
				let tpl: Template;
				try {
					tpl = JSON.parse(json);
				} catch (e) {
					throw new NodeOperationError(this.getNode(), `Invalid JSON: ${(e as Error).message}`);
				}
				const saved = await mgr.upsert(tpl);
				return [[{ json: { ok: true, id: saved.id, name: saved.name } }]];
			}

			const name = this.getNodeParameter('templateName', 0) as string;
			const vendor = this.getNodeParameter('vendor', 0) as string;
			const deviceOs = this.getNodeParameter('deviceOs', 0, '') as string;
			const command = this.getNodeParameter('command', 0, '') as string;
			const states = this.getNodeParameter('states', 0, {}) as IDataObject;
			const params: Record<string, unknown> = { templateName: name, vendor, deviceOs, command, states };
			const built = buildTemplateFromParams(params);
			const saved = await mgr.upsert(built);
			return [[{ json: { ok: true, id: saved.id, name: saved.name } }]];
		}

		if (operation === 'uploadTemplate') {
			const json = this.getNodeParameter('templateJson', 0) as string;
			let tpl: Template;
			try {
				tpl = JSON.parse(json);
			} catch (e) {
				throw new NodeOperationError(this.getNode(), `Invalid JSON: ${(e as Error).message}`);
			}
			const saved = await mgr.upsert(tpl);
			return [[{ json: { ok: true, id: saved.id, name: saved.name } }]];
		}

		if (operation === 'manageTemplates') {
			const action = this.getNodeParameter('manageAction', 0) as string;
			if (action === 'list') {
				const list = await mgr.list();
				return [list.map((t) => ({ json: t as unknown as IDataObject }))];
			}
			if (action === 'delete') {
				const id = this.getNodeParameter('deleteId', 0) as string;
				await mgr.remove(id);
				return [[{ json: { ok: true, deleted: id } }]];
			}
		}

		throw new NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`);
	}
}
