import path from 'path';
import fs from 'fs-extra';
import { Template } from './types/template';
import { TemplateValidator } from './TemplateValidator';

export class TemplateManager {
	private storageDir: string;

	constructor(storageDir?: string) {
		const base = process.env.N8N_USER_FOLDER || process.env.HOME || process.cwd();
		const root = storageDir || path.join(base, '.n8n', 'ssh-template-parser');
		this.storageDir = root;
	}

	async init(): Promise<void> {
		await fs.ensureDir(this.storageDir);
		await fs.ensureDir(path.join(this.storageDir, 'templates'));
		await this.seedBundledTemplates();
	}

	private async seedBundledTemplates(): Promise<void> {
		try {
			const bundledDir = path.join(__dirname, 'templates');
			const exists = await fs.pathExists(bundledDir);
			if (!exists) return;
			const files = (await fs.readdir(bundledDir)).filter((f: string) => f.endsWith('.json'));
			for (const file of files) {
				const data = await fs.readJson(path.join(bundledDir, file));
				const template = data as Template;
				if (!(TemplateValidator.validate(template) as any).valid) continue;
				const target = path.join(this.storageDir, 'templates', `${template.id}.json`);
				if (!(await fs.pathExists(target))) {
					await fs.writeJson(target, template, { spaces: 2 });
				}
			}
		} catch {
			// ignore seeding errors to not block node usage
		}
	}

	private templatePath(id: string): string {
		return path.join(this.storageDir, 'templates', `${id}.json`);
	}

	async list(): Promise<Template[]> {
		await this.init();
		const dir = path.join(this.storageDir, 'templates');
		const files = (await fs.readdir(dir)).filter((f: string) => f.endsWith('.json'));
		const templates: Template[] = [];
		for (const f of files) {
			try {
				templates.push(await fs.readJson(path.join(dir, f)));
			} catch {
				continue;
			}
		}
		return templates;
	}

	async get(id: string): Promise<Template | undefined> {
		await this.init();
		const file = this.templatePath(id);
		if (!(await fs.pathExists(file))) return undefined;
		return fs.readJson(file);
	}

	async upsert(template: Template): Promise<Template> {
		await this.init();
		const validation = TemplateValidator.validate(template);
		if (validation.valid !== true) {
			throw new Error(`Template invalid: ${(validation as any).errors?.join('; ')}`);
		}
		const now = new Date().toISOString();
		template.metadata = template.metadata || { created: now, updated: now };
		if (!template.metadata.created) template.metadata.created = now;
		template.metadata.updated = now;
		await fs.writeJson(this.templatePath(template.id), template, { spaces: 2 });
		return template;
	}

	async remove(id: string): Promise<void> {
		await this.init();
		const file = this.templatePath(id);
		if (await fs.pathExists(file)) await fs.remove(file);
	}
}