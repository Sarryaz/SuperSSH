import { Template, State, StatePattern } from './types/template';

export function buildTemplateFromParams(params: Record<string, unknown>): Template {
	const id = String(params['id'] || params['templateName'] || `tpl_${Date.now()}`);
	const name = String(params['templateName'] || id);
	const vendor = (params['vendor'] as Template['vendor']) || 'generic';
	const command = (params['command'] as string) || undefined;
	const deviceOs = (params['deviceOs'] as string) || undefined;

	const statesParam = (params['states'] as any) || {};
	const stateArray: State[] = [];
	// n8n fixedCollection produces shape: { state: [{ name: string, patterns: { pattern: [{...}] } }] }
	const statesInput = Array.isArray(statesParam.state) ? statesParam.state : [];
	for (const s of statesInput) {
		const patternsInput = s.patterns?.pattern || [];
		const patterns: StatePattern[] = [];
		for (const p of patternsInput) {
			const actions = [] as StatePattern['actions'];
			if (p.emit) actions?.push({ type: 'emit' });
			let map: Record<string, string> | undefined;
			if (typeof p.map === 'string' && p.map.trim().length > 0) {
				try {
					map = JSON.parse(p.map);
				} catch {
					// ignore invalid map
				}
			}
			patterns.push({
				regex: String(p.regex || ''),
				flags: p.flags ? String(p.flags) : undefined,
				map,
				actions,
				transition: { to: String(p.transitionTo || 'self') },
			});
		}
		stateArray.push({ name: String(s.name || 'start'), patterns });
	}

	return {
		id,
		name,
		vendor,
		command,
		deviceOs,
		states: stateArray.length ? stateArray : [
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
