import { Template } from './types/template';

export class TemplateValidator {
	static validate(template: Template): { valid: true } | { valid: false; errors: string[] } {
		const errors: string[] = [];

		if (!template.id) errors.push('Missing template id');
		if (!template.name) errors.push('Missing template name');
		if (!template.vendor) errors.push('Missing vendor');
		if (!template.states || template.states.length === 0) {
			errors.push('Template must define at least one state');
		}

		const stateNames = new Set(template.states?.map((s) => s.name));
		for (const state of template.states || []) {
			if (!state.name) errors.push('State without a name');
			if (!state.patterns || state.patterns.length === 0) {
				errors.push(`State ${state.name} has no patterns`);
				continue;
			}
			for (const p of state.patterns) {
				try {
					// eslint-disable-next-line no-new
					new RegExp(p.regex, p.flags);
				} catch (e) {
					errors.push(`Invalid regex in state ${state.name}: ${(e as Error).message}`);
				}
				if (p.transition?.to && p.transition.to !== 'self' && p.transition.to !== 'end') {
					if (!stateNames.has(p.transition.to)) {
						errors.push(`Transition from ${state.name} to unknown state ${p.transition.to}`);
					}
				}
			}
		}

		if (errors.length > 0) return { valid: false, errors };
		return { valid: true };
	}
}