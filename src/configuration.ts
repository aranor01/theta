import path from 'path';
import * as fs from 'fs';
import os from 'os';
import { WorkspaceConfiguration, workspace } from 'vscode';
import { Eta, EtaConfig } from 'eta';
import { ThetaError } from './thetaError';
import * as yaml from 'js-yaml';

// type trimConfig = "nl" | "slurp" | false;
const PRE_CHECK_JS_MODULES: boolean = true

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
	// autoTrim: trimConfig | [trimConfig, trimConfig] | undefined;
}

function expandTilde(filepath: string): string {
	let home = null;
	filepath = filepath.trimStart()
	if (filepath.length != 0 && filepath.charCodeAt(0) === 126 /* ~ */) {
		try {
			home = os.homedir();
		}
		catch (_e) {
			// ignore error, home is null
		}
	}

	return home ? path.join(home, filepath.slice(1)) : filepath;
}

function typeIsValid(value: unknown, expectedType: string): boolean {
	// make this more complex to add tolerance (e.g. quoted), or keep it strict using external library to validate against json schema
	return expectedType === "undefined" || typeof value == expectedType;
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

	buildEtaConfigReader(customConfig?: Partial<EtaConfig>, baseConfig?: TemplateConfiguration): EtaConfigReader {
		return new EtaConfigReader(new Eta(customConfig), this, baseConfig ?? this.defaultTemplateConfig)
	}

	readTemplateConfigurationFromObject(obj: any, defaults: TemplateConfiguration): TemplateConfiguration {
		const conf: Partial<TemplateConfiguration> = obj;
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
	static jsIdRegExp: RegExp = /[_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*/u
	static importJsRegExp: RegExp = /^@importJs\s+(["'])((?:\\\1|.)*?)\1(?:\s+as\s+(\S+))?\s*$/
	static frontMatterRegExp: RegExp = /^<%\/\*{3,}\s*[Tt]heta\s+(.*?)(\*+\/)?%>\s*/sd
	baseConfig: TemplateConfiguration;
	templateConfig: TemplateConfiguration;
	jsModulesCache: Map<String, String> = new Map<String, String>();
	defaultAutoTrim: any;
	defaultAutoEscape: boolean = false;
	rootTemplateProcessed: boolean = false;

	constructor(eta: Eta, config: Configuration, baseConfig: TemplateConfiguration) {
		this.eta = eta
		eta.configure({ plugins: new Array({ processTemplate: this.processTemplate.bind(this), processAST: this.processAST.bind(this) }) })
		this.config = config;
		this.baseConfig = baseConfig;
		this.templateConfig = baseConfig;
	}


	render<T extends object>(template: string, data: T): Promise<string> {
		this.defaultAutoTrim = this.eta.config.autoTrim;
		this.defaultAutoEscape = this.eta.config.autoEscape;
		this.rootTemplateProcessed = false;
		this.templateConfig = this.baseConfig;
		return this.eta.renderAsync(template, data)
	}

	/**
	 * Fetch the configuration from the theta front matter
	 */
	readConfig(template: string): void {
		const templatePath = this.eta.resolvePath(template);
		const rootTemplate: string = this.eta.readFile(templatePath)
		this.parseFrontMatter(rootTemplate, true, null);
		// TODO cache rootTemplate (if eta TemplateFunction cannot be used in this case)
		// in order to reuse it when render is called
		// https://eta.js.org/docs/api#customizing-file-handling
	}

	private trimNl(buffer: any, index: number) {
		if (buffer.length > index) {
			let templateObj: any = buffer[index]
			const re = /^(?:\\r\\n|\\n|\\r)/
			if (Object.prototype.hasOwnProperty.call(templateObj, "val")) {
				templateObj.val = templateObj.val.replace(re, "")
			} else {
				buffer[index] = templateObj.replace(re, "")
			}
		}
	}

	/**
	 * Parse the front matter (if present) and return the rest of str
	 * @param str input string
	 * @param readThetaConfig must be false if only file-specific configuration is needed
	 * @param config eta config (used to store file-specific configuration)
	 */
	private parseFrontMatter(str: string, readThetaConfig: boolean, config: any): string {
		const match = EtaConfigReader.frontMatterRegExp.exec(str)
		if (match) {
			if (!match[2] || !match.indices) {
				throw new ThetaError("Theta header is not correctly closed");
			}
			let frontMatterConfig: any
			try {
				frontMatterConfig = yaml.load(match[1])
			} catch (error) {
				throw new ThetaError("Cannot read theta header", error);
			}
			if (frontMatterConfig instanceof Object) {
				if (config != null) {
					if ("autoTrim" in frontMatterConfig) {
						config.autoTrim = frontMatterConfig["autoTrim"]
					}
					if ("autoEscape" in frontMatterConfig) {
						config.autoEscape = frontMatterConfig["autoEscape"]
					}
				}

				if (readThetaConfig) {
					this.templateConfig = this.config.readTemplateConfigurationFromObject(frontMatterConfig, this.baseConfig)
				}
			}
			return str.substring(match.indices[0][1])
		}
		return str
	}

	private processTemplate(str: string, config: any) {
		let readThetaConfig: boolean = !this.rootTemplateProcessed
		this.rootTemplateProcessed = true
		config.autoTrim = this.defaultAutoTrim
		config.autoEscape = this.defaultAutoEscape

		return this.parseFrontMatter(str, readThetaConfig, config)
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private processAST(buffer: any, _config: any) {
		let nextIndex = 0;
		for (let item of buffer) {
			nextIndex++;
			if (item.t === "e") {
				const val = item.val.trim()
				//if (EtaConfigReader.importJsRegExp.test(val)) {
				const match = EtaConfigReader.importJsRegExp.exec(val)
				if (match) {
					//trims next leading newline if present
					this.trimNl(buffer, nextIndex)
					const jsPath = match[2]
					let varName = match[3]

					if (jsPath != null) {
						let code: string = ""
						const jsModulePath = this.eta.resolvePath(jsPath);
						let jsModuleContent = this.jsModulesCache.get(jsModulePath);
						if (jsModuleContent === undefined) {
							jsModuleContent = fs.readFileSync(jsModulePath, "utf8");
							this.jsModulesCache.set(jsModulePath, jsModuleContent)
							if (PRE_CHECK_JS_MODULES) {
								try {
									new Function(jsModuleContent as string)
								} catch (e) {
									let errorName = (e instanceof Error) ? e.name : "Error"
									throw new ThetaError(`${errorName} in "${jsPath}"`, e);
								}
							}
						}
						if (varName == null) {
							varName = path.parse(jsPath).name;
						}
						if (!EtaConfigReader.jsIdRegExp.test(varName)) {
							throw new ThetaError(`"${varName}" is not a valid javaScript identifier`);
						}
						code += `;let ${varName}=(function(){return ${jsModuleContent}})();`
						item.val = code
					}
				}
			}
		}
		return buffer
	}
}
