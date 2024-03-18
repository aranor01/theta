import path from 'path';
import os from 'os';
import { WorkspaceConfiguration, workspace } from 'vscode';
import { Eta } from 'eta';


export enum TransformDefaultSelection {
	None = "none",
	Word = "word",
	Line = "line",
	Document = "document"
}
export class TemplateConfiguration {
	isSnippet: boolean = false;
	defaultSelection: TransformDefaultSelection = TransformDefaultSelection.Line;
	formatOnPaste: boolean = false;
}

function expandTilde(filepath: string): string {
	let home = null;
	filepath = filepath.trimStart()
	if (filepath.length != 0 && filepath.charCodeAt(0) === 126 /* ~ */) {
		try {
			home = os.homedir();
		}
		catch (e) {
			// ignore error, home is null
		}
	}

	return home ? path.join(home, filepath.slice(1)) : filepath;
}

function typeIsValid(value: unknown, expectedType: string): boolean {
	// make this more complex to add tollerance (e.g. quoted), or keep it strict using external library to validate against json schema
	return typeof value == expectedType;
}
export class Configuration {
	templatesPath: string
	defaultTemplateConfig: TemplateConfiguration = new TemplateConfiguration()

	constructor() {
		const config = workspace.getConfiguration('theta');
		this.templatesPath = expandTilde(config.get("templatesPath") ?? "").trim();
		const editorConfig = workspace.getConfiguration('editor');
		this.defaultTemplateConfig.formatOnPaste = editorConfig.get("formatOnPaste") ?? false
	}

	buildEtaConfigReader(eta: Eta, baseConfig?: TemplateConfiguration): EtaConfigReader {
		return new EtaConfigReader(eta, this, baseConfig ?? this.defaultTemplateConfig)
	}

	readTemplateConfigurationFromJson(json: string, defaults: TemplateConfiguration): TemplateConfiguration {
		const conf: Partial<TemplateConfiguration> = JSON.parse(json);
		type KeyType = keyof TemplateConfiguration;
		for (const k in conf) {
			const key = k as KeyType;
			if (!typeIsValid(conf[key], typeof this.defaultTemplateConfig[key])) {
				delete conf[key];
			}
		}
		return { ...defaults, ...conf };
	}


	readTemplateConfigurationFromWorkspaceConfiguration(config: WorkspaceConfiguration): TemplateConfiguration {

		const conf: Partial<TemplateConfiguration> = {
			isSnippet: config.get("isSnippet"),
			defaultSelection: config.get("defaultSelection"),
			formatOnPaste: config.get("formatOnPaste")
		};
		return { ...this.defaultTemplateConfig, ...conf };
	}
}



export class EtaConfigReader {
	eta: Eta
	config: Configuration
	static configRegExp: RegExp = /^@\s*config\s*\(([^]*)\)$/
	templateConfig: TemplateConfiguration;

	constructor(eta: Eta, config: Configuration, baseConfig: TemplateConfiguration) {
		this.eta = eta
		eta.configure({ plugins: new Array({ processAST: this.processAST.bind(this) }) })
		this.config = config;
		this.templateConfig = baseConfig;
	}

	/**
	 * Render only to fetch the configuration from "@config"
	 */
	run(template: string): void {
		this.eta.withConfig({ plugins: [{ processAST: this.processAST.bind(this), processFnString: EtaConfigReader.sink }] }).render(template, {});

	}

	private static sink(): string {
		return ""
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private processAST(buffer: any, _env: any) {
		const firstItem = buffer[0]
		if (firstItem.t === "e") {
			const val = firstItem.val.trim()

			if (EtaConfigReader.configRegExp.test(val)) {
				buffer.shift()
				const match = EtaConfigReader.configRegExp.exec(val)
				if (match) {
					const json = match[1]
					this.templateConfig = this.config.readTemplateConfigurationFromJson(json, this.templateConfig)
				}
			}
		}
		return buffer
	}
}
