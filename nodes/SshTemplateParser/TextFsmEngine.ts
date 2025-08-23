import { ParsedResult, ParsedRecord, Template } from './types/template';
import { CompiledTemplate, CompiledState, CompiledPattern } from './types/parser';

export class TextFsmEngine {
	private compiledCache: Map<string, CompiledTemplate> = new Map();

	parseOutput(output: string, template: Template): ParsedResult {
		const compiled = this.getOrCompile(template);
		const lines = output.split(/\r?\n/);
		const records: ParsedRecord[] = [];
		const working: Record<string, unknown> = {};

		let currentStateName = compiled.startState;
		let linesProcessed = 0;
		let matches = 0;
		const errors: string[] = [];

		for (const line of lines) {
			linesProcessed += 1;
			const state = compiled.states.get(currentStateName);
			if (!state) {
				errors.push(`Unknown state: ${currentStateName}`);
				break;
			}

			let matched = false;
			for (const pattern of state.patterns) {
				const m = pattern.regex.exec(line);
				if (!m) continue;
				matched = true;
				matches += 1;

				// collect named groups
				const groups = m.groups || {};
				// map groups to variables
				for (const [groupName, value] of Object.entries(groups)) {
					const varName = pattern.map?.[groupName] || groupName;
					working[varName] = value;
				}

				// execute actions
				for (const action of pattern.actions || []) {
					if (action.type === 'set' && action.variable) {
						const value = action.fromGroup ? groups[action.fromGroup] : action.value;
						working[action.variable] = value;
					}
					if (action.type === 'clear' && action.variable) {
						delete working[action.variable];
					}
					if (action.type === 'append' && action.variable) {
						const current = working[action.variable];
						const value = action.fromGroup ? groups[action.fromGroup] : action.value;
						if (Array.isArray(current)) {
							(current as unknown[]).push(value);
						} else if (current === undefined) {
							working[action.variable] = [value];
						} else {
							working[action.variable] = [current, value];
						}
					}
					if (action.type === 'emit') {
						records.push({ ...working });
					}
				}

				// transition
				const t = pattern.transition;
				if (t && (t.when === 'always' || t.when === undefined || t.when === 'match')) {
					if (t.to === 'self') {
						// stay
					} else if (t.to === 'end') {
						// stop processing entirely
						linesProcessed = lines.length; // consider rest processed
						break;
					} else {
						currentStateName = t.to;
					}
				}

				break; // stop after first matching pattern in this state
			}

			if (!matched) {
				// no-op: remain in current state
				continue;
			}
		}

		return {
			templateId: template.id,
			templateName: template.name,
			records,
			meta: { linesProcessed, matches, errors: errors.length ? errors : undefined },
		};
	}

	private getOrCompile(template: Template): CompiledTemplate {
		const fromCache = this.compiledCache.get(template.id);
		if (fromCache) return fromCache;

		const states = new Map<string, CompiledState>();
		for (const s of template.states) {
			const compiledPatterns: CompiledPattern[] = s.patterns.map((p) => ({
				regex: new RegExp(p.regex, p.flags),
				map: p.map,
				actions: p.actions,
				transition: p.transition,
			}));
			states.set(s.name, { name: s.name, patterns: compiledPatterns });
		}
		const compiled: CompiledTemplate = {
			template,
			states,
			startState: template.states[0].name,
		};
		this.compiledCache.set(template.id, compiled);
		return compiled;
	}
}