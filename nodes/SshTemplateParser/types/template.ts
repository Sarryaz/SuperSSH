export interface Template {
	id: string;
	name: string;
	description: string;
	vendor: 'aruba' | 'cisco' | 'juniper' | 'generic';
	deviceOs: string;
	command: string;
	variables: Variable[];
	states: State[];
	metadata: TemplateMetadata;
}

export interface Variable {
	name: string;
	pattern: string;
	description: string;
	required: boolean;
	type: 'string' | 'number' | 'ip' | 'mac' | 'vlan' | 'list' | 'boolean';
	defaultValue?: string | number | boolean;
	validation?: {
		min?: number;
		max?: number;
		enum?: string[];
		regex?: string;
	};
}

export interface State {
	name: string;
	patterns: string[];
	actions: Action[];
	transitions: Transition[];
	isStart?: boolean;
	isEnd?: boolean;
}

export interface Action {
	type: 'record' | 'clear' | 'set' | 'continue';
	target: string;
	value?: string;
	condition?: string;
}

export interface Transition {
	condition: string;
	targetState: string;
	priority?: number;
}

export interface TemplateMetadata {
	created: Date;
	updated: Date;
	version: string;
	author: string;
	tested: boolean;
	tags: string[];
	examples: string[];
}

export interface ParsedResult {
	success: boolean;
	data: Record<string, any>[];
	errors: string[];
	warnings: string[];
	metadata: {
		templateId: string;
		templateName: string;
		parseTime: number;
		linesProcessed: number;
		variablesExtracted: number;
	};
}

export interface TemplateValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
	suggestions: string[];
}

export interface TemplateSearchCriteria {
	vendor?: string;
	deviceOs?: string;
	command?: string;
	tags?: string[];
	author?: string;
	tested?: boolean;
}

export interface TemplateImportExport {
	template: Template;
	exportDate: Date;
	exportVersion: string;
	checksum: string;
}