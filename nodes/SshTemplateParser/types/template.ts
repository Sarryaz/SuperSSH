export type Vendor = 'aruba' | 'cisco' | 'juniper' | 'generic';

export type VariableType = 'string' | 'number' | 'ip' | 'mac' | 'list';

export interface Variable {
	name: string;
	pattern: string;
	description?: string;
	required?: boolean;
	type?: VariableType;
}

export interface Transition {
	to: string; // state name, 'self', or 'end'
	when?: 'match' | 'always';
}

export type ActionType = 'emit' | 'set' | 'clear' | 'append';

export interface Action {
	type: ActionType;
	// for 'set'/'append', pick from capture group or constant
	variable?: string;
	fromGroup?: string; // named group to take value from
	value?: string; // constant value
}

export interface StatePattern {
	// Regex with named capture groups for variables
	regex: string;
	// optional map to coerce group names to variable names
	map?: Record<string, string>;
	// optional flags like 'i', 'm'
	flags?: string;
	// actions if this regex matches
	actions?: Action[];
	// next state transition
	transition?: Transition;
}

export interface State {
	name: string;
	patterns: StatePattern[];
}

export interface TemplateMetadata {
	created: string; // ISO date string
	updated: string; // ISO date string
	version?: string;
	author?: string;
	tested?: boolean;
}

export interface Template {
	id: string;
	name: string;
	description?: string;
	vendor: Vendor;
	deviceOs?: string;
	command?: string;
	variables?: Variable[];
	states: State[];
	metadata?: TemplateMetadata;
}

export interface ParsedRecord {
	[key: string]: unknown;
}

export interface ParsedResult {
	templateId: string;
	templateName: string;
	records: ParsedRecord[];
	meta: {
		linesProcessed: number;
		matches: number;
		errors?: string[];
	};
}