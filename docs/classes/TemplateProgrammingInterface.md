# Class: TemplateProgrammingInterface

## Table of contents

### Properties

- [destination](TemplateProgrammingInterface.md#destination)
- [source](TemplateProgrammingInterface.md#source)
- [text](TemplateProgrammingInterface.md#text)

### Accessors

- [rows](TemplateProgrammingInterface.md#rows)

### Methods

- [fail](TemplateProgrammingInterface.md#fail)

## Properties

### destination

• `Optional` **destination**: [`Document`](Document.md)

The document where the output will be written to, or undefined if it will be copied to the clipboard
It's the same object in [source](TemplateProgrammingInterface.md#source) in the case of the theta.transformSelection command

___

### source

• `Optional` **source**: [`Document`](Document.md)

The document where [text](TemplateProgrammingInterface.md#text) is taken from, or undefined if it comes from the clipboard

___

### text

• **text**: `string`

Contain the input text to be processed
It can be the selection, the current word, the current line, the whole document or the content of the clipboard
according to the template configuration and the command executed

## Accessors

### rows

• `get` **rows**(): `string`[]

Returns [text](TemplateProgrammingInterface.md#text) split in an array of rows

#### Returns

`string`[]

## Methods

### fail

▸ **fail**(`message`): `void`

Stop the template execution showing an error message

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `message` | `string` | the text that will be shown to the user |

#### Returns

`void`
