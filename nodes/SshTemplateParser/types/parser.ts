import type { StatePattern, Template } from './template';

export interface CompiledPattern {
	regex: RegExp;
	map?: Record<string, string>;
	actions?: StatePattern['actions'];
	transition?: StatePattern['transition'];
}

export interface CompiledState {
	name: string;
	patterns: CompiledPattern[];
}

export interface CompiledTemplate {
	template: Template;
	states: Map<string, CompiledState>;
	startState: string;
}