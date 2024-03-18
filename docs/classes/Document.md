# Class: Document

A document in Visual Studio Code editor, source of the text input to tranform and/or recipient of the output

## Table of contents

### Properties

- [isUntitled](Document.md#isuntitled)
- [languageId](Document.md#languageid)
- [uri](Document.md#uri)

### Accessors

- [relativePath](Document.md#relativepath)

## Properties

### isUntitled

• **isUntitled**: `boolean`

Is this document represents an untitled file which has not been saved yet.

___

### languageId

• **languageId**: `string`

The identifier of the language associated with this document.
See [Known language identifiers](https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers)

___

### uri

• **uri**: `Uri`

The uri for the document. See [TextDocument.uri](https://code.visualstudio.com/api/references/vscode-api#TextDocument.uri)

## Accessors

### relativePath

• `get` **relativePath**(): `string`

Returns a path relative to the workspace folder if the document is contained in one, otherwise it's equivalent to `uri.path`

#### Returns

`string`
