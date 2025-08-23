import { Template } from './types/template';

export function buildTemplateFromParams(params: Record<string, unknown>): Template {
	const id = String(params['id'] || params['templateName'] || `tpl_${Date.now()}`);
	const name = String(params['templateName'] || id);
	const vendor = (params['vendor'] as Template['vendor']) || 'generic';
	const command = (params['command'] as string) || undefined;
	const deviceOs = (params['deviceOs'] as string) || undefined;

	return {
		id,
		name,
		vendor,
		command,
		deviceOs,
		states: [
			{
				name: 'start',
				patterns: [
					{
						regex: '^(?<line>.*)$',
						actions: [{ type: 'set', variable: 'line', fromGroup: 'line' }],
						transition: { to: 'self' },
					},
				],
			},
		],
		metadata: { created: new Date().toISOString(), updated: new Date().toISOString() },
	};
}