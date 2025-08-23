import { ParsedResult, ParsedRecord, Template, Variable } from './types/template';
import { CompiledTemplate, CompiledState, CompiledPattern } from './types/parser';

export interface EngineOptions {
	debug?: boolean;
	resetOnEmit?: boolean; // if true, clear working after emit (filldown off)
	coerceTypes?: boolean;
}

export class TextFsmEngine {
	private compiledCache: Map<string, CompiledTemplate> = new Map();

	parseOutput(output: string, template: Template, options: EngineOptions = {}): ParsedResult & { trace?: unknown[] } {
		const compiled = this.getOrCompile(template);
		const lines = output.split(/\r?\n/);
		const records: ParsedRecord[] = [];
		const working: Record<string, unknown> = {};
		const trace: unknown[] = [];

		let currentStateName = compiled.startState;
		let linesProcessed = 0;
		let matches = 0;
		const errors: string[] = [];

		const variableIndex = new Map<string, Variable>();
		for (const v of template.variables || []) variableIndex.set(v.name, v);

		for (const line of lines) {
			linesProcessed += 1;
			const state = compiled.states.get(currentStateName);
			if (!state) {
				errors.push(`Unknown state: ${currentStateName}`);
				break;
			}

			let matched = false;
			let matchedIdx = -1;
			for (let idx = 0; idx < state.patterns.length; idx += 1) {
				const pattern = state.patterns[idx];
				const m = pattern.regex.exec(line);
				if (!m) continue;
				matched = true;
				matchedIdx = idx;
				matches += 1;

				const groups = m.groups || {};
				for (const [groupName, value] of Object.entries(groups)) {
					const varName = pattern.map?.[groupName] || groupName;
					working[varName] = options.coerceTypes ? this.coerceValue(varName, value as string, variableIndex) : value;
				}

				for (const action of pattern.actions || []) {
					if (action.type === 'set' && action.variable) {
						const value = action.fromGroup ? groups[action.fromGroup] : action.value;
						working[action.variable] = options.coerceTypes ? this.coerceValue(action.variable, String(value ?? ''), variableIndex) : value;
					}
					if (action.type === 'clear' && action.variable) {
						delete working[action.variable];
					}
					if (action.type === 'append' && action.variable) {
						const current = working[action.variable];
						const value = action.fromGroup ? groups[action.fromGroup] : action.value;
						const finalVal = options.coerceTypes ? this.coerceValue(action.variable, String(value ?? ''), variableIndex) : value;
						if (Array.isArray(current)) {
							(current as unknown[]).push(finalVal);
						} else if (current === undefined) {
							working[action.variable] = [finalVal];
						} else {
							working[action.variable] = [current, finalVal];
						}
					}
					if (action.type === 'emit') {
						records.push({ ...working });
						if (options.resetOnEmit) {
							for (const key of Object.keys(working)) delete working[key];
						}
					}
				}

				const t = pattern.transition;
				if (t && (t.when === 'always' || t.when === undefined || t.when === 'match')) {
					if (t.to === 'self') {
						// stay
					} else if (t.to === 'end') {
						linesProcessed = lines.length;
						break;
					} else {
						currentStateName = t.to;
					}
				}

				break;
			}

			if (options.debug) {
				trace.push({ line, state: currentStateName, matched, matchedIdx });
			}

			if (!matched) {
				continue;
			}
		}

		return {
			templateId: template.id,
			templateName: template.name,
			records,
			meta: { linesProcessed, matches, errors: errors.length ? errors : undefined },
			...(options.debug ? { trace } : {}),
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

	private coerceValue(name: string, raw: string, index: Map<string, Variable>): unknown {
		const def = index.get(name);
		if (!def || !def.type) return raw;
		switch (def.type) {
			case 'number': {
				const n = Number(raw);
				return Number.isNaN(n) ? raw : n;
			}
			case 'list': {
				return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
			}
			default:
				return raw;
		}
	}
}
