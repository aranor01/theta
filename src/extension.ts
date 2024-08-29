// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Eta } from "eta"
import { ExtensionContext, QuickPickItem, QuickPickItemKind, Range, SnippetString, TextEdit, TextEditor, TextEditorEdit, commands, window } from 'vscode';
import * as configuration from './configuration';
import { Document, TemplateProgrammingInterface } from './templateProgrammingInterface';
import { ThetaError } from './thetaError';


class SortablePickItem implements QuickPickItem {
	constructor(public label: string = "", public order: number = 0) {
		this.label = label;
		this.order = order;
	}

	static compare(a: SortablePickItem, b: SortablePickItem): number {
		return a.order - b.order
	}

	static findIndexByLabel(items: SortablePickItem[], label: string) {
		return items.findIndex((value: SortablePickItem) => value.label == label)
	}

	static findByLabel(items: SortablePickItem[], label: string) {
		const ret = SortablePickItem.findIndexByLabel(items, label)
		return ret == -1 ? undefined : items[ret]
	}
}

class SeparatorPickItem extends SortablePickItem {
	kind?: QuickPickItemKind = QuickPickItemKind.Separator;
	constructor(label: string = "", public order: number = 0) {
		super(label, order)
	}
}

class TemplatePickItem extends SortablePickItem {
	//configuration?:TemplateConfiguration
	constructor(file: fs.Dirent) {
		super(path.parse(file.name).name, 1)
		//this.description = path.dirname(path.relative(base.fsPath, uri.fsPath));
	}
}


function showError(message: string): void {
	window.showInformationMessage(message, "Configure")
		.then(answer => {
			if (answer === "Configure") {
				commands.executeCommand('workbench.action.openSettingsJson', { revealSetting: { key: 'theta.templatesPath', edit: true } });
			}
		});
}


function hasFlag(options: TransformCommandOptions, option: TransformCommandOptions) {
	return (options & option) == option;
}

enum TransformCommandOptions {
	ReadFromClipboard = 0,
	ReadFromSelection = 1,
	WriteToClipboard = 0 << 1,
	WriteToSelection = 1 << 1,
}

const RECENTLY_USED_TEMPLATES_STATE_KEY = "recent";
const RECENTLY_USED_TEMPLATES_LENGH = 4;
// per-template options:
// - work on whole document
// - format document at the end 

async function chooseTemplate(context: ExtensionContext, config:configuration.Configuration): Promise<string | undefined>
{
	if (config.templatesPath.trim().length == 0) {
		showError("The templates path is not configured");
		return;
	}

	let template:string

	let files: fs.Dirent[];
	try {
		files = fs.readdirSync(config.templatesPath, { withFileTypes: true });
	}
	catch (err) {
		showError("Error occurring when reading template directory: " + ((err instanceof Error) ? err.message : err));
		return;
	}
	files = files.filter(file => file.isFile() && path.extname(file.name) == ".eta");
	if (files.length == 0) {
		showError("The tempates directory does not contain templates");
		return;
	}
	const pickItems: SortablePickItem[] = files.map(f => new TemplatePickItem(f));
	const recentItems: string[] = context.globalState.get(RECENTLY_USED_TEMPLATES_STATE_KEY) as string[] ?? new Array<string>();//["capitalize"]
	const mostRecentlyUsedOrder: number = -recentItems.length;
	let order: number = mostRecentlyUsedOrder;
	for (const recentItem of recentItems) {
		const pickItem = pickItems.find((v) => v.label == recentItem)
		if (pickItem) {
			pickItem.order = order++;
		}
	}
	if (order > mostRecentlyUsedOrder) {
		pickItems.push(new SeparatorPickItem("recently used", mostRecentlyUsedOrder - 1))
		pickItems.push(new SeparatorPickItem("", order))
		pickItems.sort(SortablePickItem.compare)
	}

	const pick = await window.showQuickPick(pickItems);
	if (!pick) return;
	template = pick.label;
	if (recentItems.length == 0 || pick.order != mostRecentlyUsedOrder) { //if selection is not alredy the most recently used template
		const index = recentItems.indexOf(template);
		if (index > 0) {
			recentItems.splice(index, 1);
		}
		recentItems.unshift(template);
		recentItems.splice(RECENTLY_USED_TEMPLATES_LENGH);
		context.globalState.update(RECENTLY_USED_TEMPLATES_STATE_KEY, recentItems)
	}

	return template
}

async function transform(context: ExtensionContext, textEditor: TextEditor, _edit: TextEditorEdit, template: string | undefined, options: TransformCommandOptions): Promise<void> {
	let transformAll = false;
	let sourceDocument: Document | undefined

	const config = new configuration.Configuration();

	const doc = textEditor.document;
	if (doc.lineCount == 0 || doc.lineAt(0).rangeIncludingLineBreak.isEmpty) return;

	if (template === undefined) {
		template = await chooseTemplate(context, config)
		if (template === undefined) return
	}

	const eta = new Eta({ views: config.templatesPath, autoEscape: false, autoTrim: false });
	const configReader = config.buildEtaConfigReader(eta);

	let inputText = "";

	let selection: Range | undefined = textEditor.selection;
	if (hasFlag(options, TransformCommandOptions.ReadFromSelection)) {
		sourceDocument = new Document(doc)
		if (!selection || selection.isEmpty) {
			//TODO read config from cache if available
			configReader.run(template)

			selection == undefined;
			switch (configReader.templateConfig.defaultSelection) {
				case configuration.TransformDefaultSelection.None:
					break;
				case configuration.TransformDefaultSelection.Word:
					selection = doc.getWordRangeAtPosition(textEditor.selection.active);
					break;
				case configuration.TransformDefaultSelection.Line:
					selection = doc.lineAt(textEditor.selection.active.line).range;
					break;
				case configuration.TransformDefaultSelection.Document:
					//trasform all document
					selection = doc.validateRange(new Range(0, 0, doc.lineCount, 0));
					transformAll = true;
					break;
				default:
					console.warn("Wrong defaultSelection value: " + configReader.templateConfig.defaultSelection)
					break;
			}
			if (selection === undefined) return;
		}
		if (transformAll) {
			inputText = doc.getText();
		}
		else {
			inputText = doc.getText(selection);
		}
	}
	else //TransformOptions.ReadFromClipboard
	{
		inputText = await vscode.env.clipboard.readText()
	}

	if (inputText.length == 0) {
		return;
	}

	let outputText: string;
	try {
		let destinationDocument: Document | undefined
		if (hasFlag(options, TransformCommandOptions.WriteToSelection)) {
			destinationDocument = sourceDocument ?? new Document(doc)
		}
		outputText = eta.render(template, new TemplateProgrammingInterface(inputText, sourceDocument, destinationDocument))
	}
	catch (err) {
		let causeError:unknown = err
		let message:string = ""
		let errorName: string = "an error"
		if (err instanceof Error) {
			if (err instanceof ThetaError) {
				message = err.message
				causeError = err.cause
			}
			else if (err.name.length > 0) {
				causeError = err
				errorName = err.name
			}
		}
		if (message.length == 0) {
			message = "The template engine returned " + errorName
		}
		if (causeError !== undefined) {
			console.error(causeError);
			message += ', please check the console'
		}
		window.showErrorMessage(message)
		return
	}

	if (hasFlag(options, TransformCommandOptions.WriteToSelection)) {
		const range: Range = selection;

		if (configReader.templateConfig.isSnippet) {
			await textEditor.insertSnippet(new SnippetString(outputText), range, { undoStopBefore: true, undoStopAfter: true })
		} else {
			await textEditor.edit((edit) => {
				edit.replace(range, outputText);
			}, { undoStopBefore: true, undoStopAfter: !configReader.templateConfig.formatOnPaste });
		}

		if (configReader.templateConfig.formatOnPaste && !configReader.templateConfig.isSnippet) {
			const textEdits: TextEdit[] | undefined = (await (transformAll ?
				commands.executeCommand(
					'vscode.executeFormatDocumentProvider',
					doc.uri,
					{})
				: commands.executeCommand(
					'vscode.executeFormatRangeProvider',
					doc.uri,
					doc.validateRange(new Range(range.start, doc.positionAt(doc.offsetAt(range.start) + outputText.length))),
					{}))
			) as TextEdit[]
			if (textEdits !== undefined) {
				await textEditor.edit((edit) => {
					for (const textEdit of textEdits) {
						edit.replace(textEdit.range, textEdit.newText);
					}
				}, { undoStopBefore: false, undoStopAfter: true });
			}
		}
	}
	else {
		vscode.env.clipboard.writeText(outputText);
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('extension "theta" active, version ' + vscode.extensions.getExtension('theta')?.packageJSON.version);

	// The commands has been defined in the package.json file
	// Now provide the implementation of the commands with registerCommand
	// The commandId parameter must match the command field in package.json
	context.subscriptions.push(
		commands.registerTextEditorCommand('theta.copyAndTransform', async (textEditor: TextEditor, edit: TextEditorEdit, args: string) => {
			transform(context, textEditor, edit, args, TransformCommandOptions.ReadFromSelection | TransformCommandOptions.WriteToClipboard);
		}),
		commands.registerTextEditorCommand('theta.transformAndPaste', async (textEditor: TextEditor, edit: TextEditorEdit, args: string) => {
			transform(context, textEditor, edit, args, TransformCommandOptions.ReadFromClipboard | TransformCommandOptions.WriteToSelection);
		}),
		commands.registerTextEditorCommand('theta.transformSelection', async (textEditor: TextEditor, edit: TextEditorEdit, args: string) => {
			transform(context, textEditor, edit, args, TransformCommandOptions.ReadFromSelection | TransformCommandOptions.WriteToSelection);
		}));
}

// This method is called when your extension is deactivated
export function deactivate() { }
