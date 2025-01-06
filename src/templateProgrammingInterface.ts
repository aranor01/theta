import os from 'os';
import { TextDocument, Uri, workspace } from 'vscode';
import { ThetaError } from './thetaError';

/**
 * A document in Visual Studio Code editor, source of the text input to transform and/or recipient of the output
 */
export class Document {
	/**
	 * The identifier of the language associated with this document.
	 * See [Known language identifiers](https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers)
	 */
	languageId: string
	/**
	 * The uri for the document. See [TextDocument.uri](https://code.visualstudio.com/api/references/vscode-api#TextDocument.uri)
	 */
	uri: Uri
	/**
	 * Is this document represents an untitled file which has not been saved yet.
	 */
	isUntitled: boolean

	private _relativePath?: string

	/** @ignore */
	constructor(doc: TextDocument) {
		this.languageId = doc.languageId
		this.uri = doc.uri
		this.isUntitled = doc.isUntitled
	}

	/**
	 * Returns a path relative to the workspace folder if the document is contained in one, otherwise it's equivalent to `uri.path`
	 */
	get relativePath(): string {
		return this._relativePath ?? (this._relativePath = workspace.asRelativePath(this.uri.path, false))
	}
}

export class TemplateProgrammingInterface {
	private _rows?: string[]
	/**
	 * Contain the input text to be processed
	 * It can be the selection, the current word, the current line, the whole document or the content of the clipboard
	 * according to the template configuration and the command executed
	 */
	text: string
	/**
	 * The document where {@link text} is taken from, or undefined if it comes from the clipboard
	 */
	source?: Document
	/**
	 * The document where the output will be written to, or undefined if it will be copied to the clipboard
	 * It's the same object in {@link source} in the case of the theta.transformSelection command
	 */
	destination?: Document

	/** @ignore */
	constructor(inputText: string, source?: Document, destination?: Document) {
		this.text = inputText
		this.source = source
		this.destination = destination
	}

	/**
	 * Returns {@link text} split in an array of rows
	 */
	get rows(): Array<string> {
		return this._rows ?? (this._rows = this.text.split(os.EOL))
	}

	/**
	 * Stop the template execution showing an error message
	 * 
	 * @param message the text that will be shown to the user 
	 */
	fail(message: string): void {
		throw new ThetaError(message);
	}
}