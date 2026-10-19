/**
 * Tokenizer — the tokens of a DOMQL text: strictly, as a query reads them, refusing the first text that is no token, or tolerantly, as tooling reads any text, an invalid token standing for each such text with its diagnostic
 */

import { DomqlError } from './DomqlError.mjs';
import { Names } from './Names.mjs';

/**
 * The types a token is, which tooling reads as they are: `invalid` for text that is no token, and `end` for the end of the text, after its last trivia.
 * A string, raw or not, inline or a block, is one literal token keeping its quote and its delimiter's length. An interpolated string is read as its opening, `$"`, `$'` or a block's `$` and quotes and line break,
 * its runs of text, the `{` and `}` around each of its interpolations and what closes it, the tokens of each interpolation's expression between them.
 * A contract within DOMQL until a public tooling API stabilizes it.
 */
export const TOKEN_TYPES = Object.freeze(['name', 'literal', 'keyword', 'context', 'invalid', 'end', 'interpolated-string-start', 'interpolated-text', 'interpolation-start', 'interpolation-end', 'interpolated-string-end', 'query-parameter', 'reserved-reference', '.', '?.', '?[', '?:', '??', '(?', '==', '!=', '<', '<=', '>', '>=', '=', '=>', '+', '-', '*', '/', '%', ',', ':', '(', ')', '{', '}', '[', ']']);

/**
 * @typedef {object} Token
 * @property {'name' | 'literal' | 'keyword' | 'context' | 'invalid' | 'end' | 'interpolated-string-start' | 'interpolated-text' | 'interpolation-start' | 'interpolation-end' | 'interpolated-string-end' | 'query-parameter' | 'reserved-reference' | '.' | '?.' | '?[' | '?:' | '??' | '(?' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '=' | '=>' | '+' | '-' | '*' | '/' | '%' | ',' | ':' | '(' | ')' | '{' | '}' | '[' | ']'} type
 * @property {unknown} [value] A name's or a keyword's text, the evaluation context's spelling, `context` or `~`, the name `~` reads the caller's binding of, the reserved word `@` reads the local or the field of, a literal's value, or the text a run of an interpolated string's text stands for.
 * @property {'"' | "'"} [quote] The quote of a string's literal token, or of an interpolated string's opening and closing tokens, `"` for a string and `'` for a raw string.
 * @property {number} [delimiter] How many quotes that string's delimiter has: one inline, three or more for a block.
 * @property {number} start
 * @property {number} end
 * @property {number} leading Where the trivia before it begins, at its start where there is none, so every character of the text belongs to one token or to the trivia before one.
 * @property {boolean} spaced Whether trivia, whitespace or a comment, comes before it, which tells an argument written after a name from one of the name's own.
 * @property {{ message: string, offset: number }} [diagnostic] Why an invalid token is no token, and where the text first fails.
 */

/** The names of each family's forms, inline and as a block, by its quote: a string, whose backslashes escape, and a raw string, whose backslashes are text. */
const DELIMITED_NAMES = Object.freeze({ '"': Object.freeze(['string', 'string block']), "'": Object.freeze(['raw string', 'raw block']) });

/** The character each escape a letter or a sign names stands for, after its backslash. */
const ESCAPES = Object.freeze({ '"': '"', '\\': '\\', n: '\n', r: '\r', t: '\t', e: '\u001B' });

/** A Unicode escape after its backslash: `u` and one to six hexadecimal digits in braces. */
const UNICODE_ESCAPE = /u\{([0-9A-Fa-f]{1,6})\}/y;

/** The tokens of one character, the arithmetic operators among them: `-` is always an operator, negation or subtraction, so no number begins with it, and `/` is one wherever no comment begins. */
const PUNCTUATION = new Set(['.', ',', ':', '(', ')', '{', '}', '[', ']', '+', '-', '*', '/', '%']);
const NAME = /[A-Za-z][A-Za-z0-9]*/y;
const NUMBER = /(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const SPACE = /\s/;

export class Tokenizer {
    #text;
    #offset = 0;

    /**
     * What is being read, innermost last: the text of an interpolated string, with where its `$` begins and its form, or the expression of one of its interpolations, with how many braces its own object expressions have opened,
     * so its `}` is told from theirs, and whether its first token is still to come, which no object expression is.
     * @type {({ kind: 'text', start: number, form: object } | { kind: 'interpolation', depth: number, isFirst: boolean })[]}
     */
    #modes = [];

    /** @param {string} text The query text. */
    constructor(text) {
        this.#text = text;
    }

    /**
     * Every token of the text, ending with an `end` token, read tolerantly: text that is no token is an invalid token holding its diagnostic, and reading goes on after it, so the tokens cover the whole text whatever it holds.
     * @param {string} text
     * @returns {Token[]}
     */
    static scan(text) {
        return new Tokenizer(text).#readAll();
    }

    /** Reads every token of the text, ending with an `end` token, refusing the first text that is no token with its diagnostic. */
    tokenize() {
        const tokens = this.#readAll();

        for (const token of tokens) {
            if (token.type === 'invalid') {
                throw DomqlError.syntax(token.diagnostic.message, this.#text, token.diagnostic.offset);
            }
        }

        return tokens;
    }

    #readAll() {
        /** @type {Token[]} */
        const tokens = [];

        for (let token = this.#read(); ; token = this.#read()) {
            tokens.push(token);

            if (token.type === 'end') {
                return tokens;
            }
        }
    }

    #read() {
        // An interpolated string's text holds no trivia: what stands between its tokens is its own text.
        if (this.#modes.at(-1)?.kind === 'text') {
            const token = this.#readText();

            token.leading = token.start;
            token.spaced = false;

            return token;
        }

        const leading = this.#offset;
        const token = this.#skipTrivia() ?? this.#readToken();

        token.leading = leading;
        token.spaced = token.start > leading;

        return token;
    }

    #readToken() {
        const start = this.#offset;
        const innermost = this.#modes.at(-1);
        const isFirstOfInterpolation = innermost?.kind === 'interpolation' && innermost.isFirst;

        if (innermost?.kind === 'interpolation') {
            innermost.isFirst = false;
        }

        // An interpolation whose expression begins with an object expression groups it, so its `{` is never read beside the interpolation's own.
        if (isFirstOfInterpolation && this.#text[start] === '{') {
            return this.#invalid(start, start + 1, 'An interpolation that begins with an object expression groups it in parentheses, as {({ x = 1 }.x)}', start);
        }

        if (start >= this.#text.length) {
            return { type: 'end', start, end: start };
        }

        const character = this.#text[start];

        // `(?` opens an optional enclosed access, one token, so no trivia stands inside it.
        if (this.#text.startsWith('(?', start)) {
            this.#offset += 2;

            return { type: '(?', start, end: this.#offset };
        }

        if (character === '$') {
            return this.#readDollar(start);
        }

        const mode = this.#modes.at(-1);

        // A brace in an interpolation opens or closes an object expression of its expression, and the `}` no object expression is open for closes the interpolation.
        if (mode?.kind === 'interpolation' && (character === '{' || character === '}')) {
            if (character === '{') {
                mode.depth++;
            } else if (mode.depth > 0) {
                mode.depth--;
            } else {
                this.#modes.pop();
                this.#offset++;

                return { type: 'interpolation-end', start, end: this.#offset };
            }
        }

        if (PUNCTUATION.has(character)) {
            this.#offset++;

            return { type: character, start, end: this.#offset };
        }

        if (['?.', '?[', '?:', '??', '==', '!=', '<=', '>=', '=>'].some(operator => this.#text.startsWith(operator, start))) {
            this.#offset += 2;

            return { type: this.#text.slice(start, this.#offset), start, end: this.#offset };
        }

        if (character === '<' || character === '>') {
            this.#offset++;

            return { type: character, start, end: this.#offset };
        }

        if (character === '@') {
            return this.#readAt(start);
        }

        if (character === '~') {
            return this.#readQueryParameter(start);
        }

        if (character === '"' || character === "'") {
            return this.#readString(start);
        }

        if (character >= '0' && character <= '9') {
            return this.#readNumber(start);
        }

        NAME.lastIndex = start;

        if (NAME.test(this.#text)) {
            this.#offset = NAME.lastIndex;

            const name = this.#text.slice(start, this.#offset);

            if (Names.isLiteral(name)) {
                return { type: 'literal', value: Names.literalValueOf(name), start, end: this.#offset };
            }

            // `context` is a keyword, given a token type of its own for the parser, which reads it where a value stands.
            if (name === 'context') {
                return { type: 'context', value: name, start, end: this.#offset };
            }

            return { type: Names.isKeyword(name) ? 'keyword' : 'name', value: name, start, end: this.#offset };
        }

        // A single `=` gives a field, a local or a binding its value, which the parser reads where one stands.
        if (character === '=') {
            this.#offset++;

            return { type: '=', start, end: this.#offset };
        }

        // A single `!` is no operator; an inequality is written `!=`, and a negation `not`.
        if (character === '!') {
            return this.#invalid(start, start + 1, "Unexpected '!': an inequality is written '!=', and a negation 'not'", start);
        }

        return this.#invalid(start, start + 1, `Unexpected '${character}'`, start);
    }

    /**
     * Moves past the trivia before a token, answering an invalid token for a block comment never closed, which runs to the end of the text; an interpolation stands on one line, so a line break
     * in its trivia, a line comment, which a line break ends, and a block comment holding one are invalid there.
     */
    #skipTrivia() {
        const isInInterpolation = this.#modes.at(-1)?.kind === 'interpolation';
        const oneLine = 'An interpolation stands on one line, its { and } with its expression: bind a longer calculation to a local, and interpolate its name';

        while (this.#offset < this.#text.length) {
            const character = this.#text[this.#offset];

            if (isInInterpolation && (Tokenizer.#isLineBreak(character) || this.#text.startsWith('//', this.#offset))) {
                return this.#invalid(this.#offset, this.#offset + 1, oneLine, this.#offset);
            }

            if (SPACE.test(character)) {
                this.#offset++;
            } else if (this.#text.startsWith('//', this.#offset)) {
                const lineEnd = this.#lineEndFrom(this.#offset);

                this.#offset = lineEnd >= this.#text.length ? lineEnd : lineEnd + Tokenizer.#lineBreakLengthAt(this.#text, lineEnd);
            } else if (this.#text.startsWith('/*', this.#offset)) {
                const commentEnd = this.#text.indexOf('*/', this.#offset + 2);

                if (commentEnd === -1) {
                    return this.#invalid(this.#offset, this.#text.length, 'A block comment is never closed', this.#offset);
                }

                if (isInInterpolation && /[\n\r]/.test(this.#text.slice(this.#offset, commentEnd))) {
                    return this.#invalid(this.#offset, commentEnd + 2, oneLine, this.#offset);
                }

                this.#offset = commentEnd + 2;
            } else {
                return null;
            }
        }

        return null;
    }

    /**
     * Reads what `@` begins: a reference to the local or the field a reserved word names, written directly after it, as `@to` reads the local `to`, since the word alone keeps its own meaning;
     * invalid where no reserved word follows it directly, a name that is none being written alone.
     */
    #readAt(start) {
        NAME.lastIndex = start + 1;

        if (!NAME.test(this.#text)) {
            const next = this.#text[start + 1];
            const message = next === undefined || SPACE.test(next)
                ? "A reserved word follows '@' directly, as @to"
                : "'@' and what follows it are no reserved reference, which writes a reserved word directly after '@', as @to";

            return this.#invalid(start, start + 1, message, start);
        }

        const name = this.#text.slice(start + 1, NAME.lastIndex);

        if (!Names.isReservedWord(name)) {
            return this.#invalid(start, NAME.lastIndex, `'${name}' is no reserved word, so it is written alone: write '${name}', with no '@'`, start);
        }

        this.#offset = NAME.lastIndex;

        return { type: 'reserved-reference', value: name, start, end: this.#offset };
    }

    /**
     * Reads what `~` begins: the caller's binding of the name written directly after it, whatever local or field shares its name and a reserved word included, as `~as` reads the binding `as`,
     * or, with no name directly after it, the evaluation context, as `context` is, so `~.size` reads `context.size`.
     */
    #readQueryParameter(start) {
        NAME.lastIndex = start + 1;

        if (!NAME.test(this.#text)) {
            this.#offset = start + 1;

            return { type: 'context', value: '~', start, end: this.#offset };
        }

        const name = this.#text.slice(start + 1, NAME.lastIndex);

        this.#offset = NAME.lastIndex;

        return { type: 'query-parameter', value: name, start, end: this.#offset };
    }

    /**
     * Reads a string of either family, a string, whose backslashes escape, or a raw string, whose backslashes are text: inline, one quote and one line, a raw string doubling its quote to hold one,
     * or a block, three or more quotes and a line break opening it and as many closing it, first on their line. Its token keeps its quote and its delimiter's length, and its value is the text it stands for.
     */
    #readString(start) {
        const quote = this.#text[start];
        const opening = this.#openingOf(start, start, quote, false);

        if (opening.token !== undefined) {
            return opening.token;
        }

        const { form } = opening;
        const scanned = this.#scanText(form.contentStart, form, false);

        if (scanned.stop === 'close') {
            const end = form.isBlock ? form.closingEnd : scanned.end + 1;

            this.#offset = end;

            return scanned.diagnostic === null
                ? { type: 'literal', value: scanned.value, start, end, quote, delimiter: form.length }
                : this.#invalid(start, end, scanned.diagnostic.message, scanned.diagnostic.offset);
        }

        // In an interpolation, a quote begins a string of the interpolation's own expression, so one never closed is most often the interpolated string's own quote written before the interpolation's `}`.
        const name = DELIMITED_NAMES[quote][0];
        const message = this.#modes.at(-1)?.kind === 'interpolation' ? `A ${name} is never closed: an interpolation is closed with '}' before its string's closing quote` : `A ${name} is never closed`;
        const unclosed = scanned.diagnostic ?? { message, offset: start };

        return this.#invalid(start, scanned.end, unclosed.message, unclosed.offset);
    }

    /**
     * The form of the string whose quotes begin at the offset, after its `$` where it is interpolated: a block where three or more quotes are followed directly by a line break, its closing delimiter
     * found first on a later line, which gives its margin; and an inline string otherwise. An opening a block cannot have, or a block never closed, answers the invalid token that says so.
     */
    #openingOf(start, quoteStart, quote, isInterpolated) {
        let run = quoteStart;

        while (this.#text[run] === quote) {
            run++;
        }

        const length = run - quoteStart;
        const names = DELIMITED_NAMES[quote];
        const prefix = isInterpolated ? 'interpolated ' : '';
        const isRaw = quote === "'";

        if (length >= 3) {
            if (Tokenizer.#isLineBreak(this.#text[run])) {
                if (this.#modes.at(-1)?.kind === 'interpolation') {
                    return { token: this.#invalid(start, run, 'An interpolation stands on one line, so it holds no block: bind the block to a local, and interpolate its name', start) };
                }

                const contentStart = run + Tokenizer.#lineBreakLengthAt(this.#text, run);
                const closing = this.#closingOf(contentStart, quote, length);

                if (closing === null) {
                    return { token: this.#invalid(start, this.#text.length, `A ${prefix}${names[1]} is never closed: its closing delimiter, ${length} quotes, stands first on a line of its own`, start) };
                }

                if (closing.diagnostic !== undefined) {
                    return { token: this.#invalid(start, closing.diagnostic.end, closing.diagnostic.message, closing.diagnostic.offset) };
                }

                return { form: { quote, length, isRaw, isBlock: true, contentStart, ...closing } };
            }

            const lineEnd = this.#lineEndFrom(run);

            if (/^[ \t]+$/.test(this.#text.slice(run, lineEnd))) {
                return { token: this.#invalid(start, lineEnd, `A ${prefix}${names[1]}'s opening delimiter is followed directly by its line break, with nothing after it on its line`, run) };
            }

            // Three double quotes never begin an inline string, whose empty `""` no value follows directly; three single quotes may, the doubled one standing for a quote.
            if (!isRaw) {
                return { token: this.#invalid(start, run, `A ${prefix}${names[1]}'s text stands on the lines between its delimiters: its opening delimiter is followed directly by a line break, and an inline ${prefix}${names[0]} opens with one quote`, run) };
            }
        }

        return { form: { quote, length: 1, isRaw, isBlock: false, contentStart: quoteStart + 1 } };
    }

    /**
     * The closing delimiter of the block whose text begins at the offset: the first line whose text after its indentation is a run of the delimiter's quote, which closes the block where it has the delimiter's length,
     * with the line's indentation its margin and the line break before it where its text ends; a longer run there is a diagnostic, and null where no line has one.
     */
    #closingOf(contentStart, quote, length) {
        for (let lineStart = contentStart; ;) {
            let offset = lineStart;

            while (this.#text[offset] === ' ' || this.#text[offset] === '\t') {
                offset++;
            }

            if (this.#text[offset] === quote) {
                let run = offset;

                while (this.#text[run] === quote) {
                    run++;
                }

                if (run - offset === length) {
                    const contentEnd = lineStart === contentStart ? contentStart : lineStart - (this.#text[lineStart - 2] === '\r' && this.#text[lineStart - 1] === '\n' ? 2 : 1);

                    return { margin: this.#text.slice(lineStart, offset), contentEnd, closingEnd: run };
                }

                if (run - offset > length) {
                    return { diagnostic: { message: `A block closes with exactly the ${length} quotes that open it, and this run has ${run - offset}: open it with a longer delimiter to hold the run`, offset, end: run } };
                }
            }

            const lineEnd = this.#lineEndFrom(offset);

            if (lineEnd >= this.#text.length) {
                return null;
            }

            lineStart = lineEnd + Tokenizer.#lineBreakLengthAt(this.#text, lineEnd);
        }
    }

    /**
     * Scans a string's text from the offset in its form: an inline string's up to its closing quote, a block's up to the line break before its closing delimiter, each line's margin removed first,
     * and an interpolated string's up to the `{` that opens an interpolation as well. The value is the text it stands for: escapes decoded in the string family, a raw string's doubled quote one quote,
     * each source line break of a block one line feed, and an interpolated string's doubled brace one brace. The first diagnostic it meets is kept, and `stop` says what ended the scan.
     * @returns {{ value: string, end: number, diagnostic: { message: string, offset: number } | null, stop: 'close' | 'brace' | 'end' }}
     */
    #scanText(start, form, isInterpolated) {
        const { quote, isRaw, isBlock } = form;
        let value = '';
        let offset = start;
        let diagnostic = null;
        let isLineStart = isBlock && (start === form.contentStart || Tokenizer.#isLineBreak(this.#text[start - 1]));

        for (;;) {
            if (isBlock && offset >= form.contentEnd) {
                return { value, end: offset, diagnostic, stop: 'close' };
            }

            if (offset >= this.#text.length) {
                return { value, end: offset, diagnostic, stop: 'end' };
            }

            if (isLineStart) {
                const margin = this.#skipMargin(offset, form);

                diagnostic ??= margin.diagnostic;
                offset = margin.offset;
                isLineStart = false;
                continue;
            }

            const character = this.#text[offset];

            if (Tokenizer.#isLineBreak(character)) {
                if (!isBlock) {
                    const names = DELIMITED_NAMES[quote];
                    const prefix = isInterpolated ? 'interpolated ' : '';
                    const escape = isRaw ? '' : 'write \\n for a line break, or ';
                    const delimiter = `${isInterpolated ? '$' : ''}${quote.repeat(3)}`;

                    diagnostic ??= { message: `A${isInterpolated ? 'n' : ''} ${prefix}${names[0]} stands on one line: ${escape}write a${isInterpolated ? 'n' : ''} ${prefix}${names[1]}, its text on the lines between ${delimiter} and ${quote.repeat(3)}`, offset };

                    return { value, end: offset, diagnostic, stop: 'end' };
                }

                value += '\n';
                offset += Tokenizer.#lineBreakLengthAt(this.#text, offset);
                isLineStart = true;
                continue;
            }

            if (character === quote) {
                if (!isBlock) {
                    if (isRaw && this.#text[offset + 1] === quote) {
                        value += quote;
                        offset += 2;
                        continue;
                    }

                    return { value, end: offset, diagnostic, stop: 'close' };
                }

                let run = offset;

                while (this.#text[run] === quote && run < form.contentEnd) {
                    run++;
                }

                if (run - offset >= form.length) {
                    diagnostic ??= { message: `A run of ${run - offset} quotes in a block's text is as long as its delimiter: open the block with a longer delimiter to hold it`, offset };
                }

                value += this.#text.slice(offset, run);
                offset = run;
                continue;
            }

            if (character === '\\' && !isRaw) {
                const escape = this.#readEscape(offset);

                if (escape.message !== undefined) {
                    diagnostic ??= { message: escape.message, offset };
                    offset++;
                } else {
                    value += escape.character;
                    offset = escape.end;
                }

                continue;
            }

            if (isInterpolated && (character === '{' || character === '}')) {
                if (this.#text[offset + 1] === character) {
                    value += character;
                    offset += 2;
                    continue;
                }

                if (character === '{') {
                    return { value, end: offset, diagnostic, stop: 'brace' };
                }

                diagnostic ??= { message: "A literal '}' in an interpolated string is written '}}'", offset };
                offset++;
                continue;
            }

            value += character;
            offset++;
        }
    }

    /**
     * Moves past the margin at the start of a block's line: the closing delimiter's indentation, which a line that is not blank begins with exactly; a blank line shorter than the margin is empty,
     * and one that begins with it keeps the whitespace after it.
     */
    #skipMargin(lineStart, form) {
        const { margin } = form;
        const lineEnd = Math.min(this.#lineEndFrom(lineStart), form.contentEnd);
        const line = this.#text.slice(lineStart, lineEnd);

        if (line.startsWith(margin)) {
            return { offset: lineStart + margin.length, diagnostic: null };
        }

        if (/^[ \t]*$/.test(line)) {
            return { offset: lineEnd, diagnostic: null };
        }

        return { offset: lineStart, diagnostic: { message: "Each line of a block that is not blank begins with its closing delimiter's indentation, the margin removed from its lines, and this one does not", offset: lineStart } };
    }

    /** Where the line the offset stands on ends: at its line break, a line feed, a carriage return or both, or at the end of the text. */
    #lineEndFrom(offset) {
        let end = offset;

        while (end < this.#text.length && !Tokenizer.#isLineBreak(this.#text[end])) {
            end++;
        }

        return end;
    }

    /** Whether the character breaks a line: a line feed, or a carriage return, alone or before a line feed. */
    static #isLineBreak(character) {
        return character === '\n' || character === '\r';
    }

    /** How many characters the line break at the offset has: two for a carriage return and a line feed, one otherwise. */
    static #lineBreakLengthAt(text, offset) {
        return text[offset] === '\r' && text[offset + 1] === '\n' ? 2 : 1;
    }

    /** Reads what `$` begins: an interpolated string's `$"` or `$'`, or its block's three or more quotes and line break, where the quote follows it directly, and otherwise text that is no token, a space between them saying where it stands. */
    #readDollar(start) {
        const quote = this.#text[start + 1];

        if (quote === '"' || quote === "'") {
            const opening = this.#openingOf(start, start + 1, quote, true);

            if (opening.token !== undefined) {
                return opening.token;
            }

            const { form } = opening;

            this.#offset = form.contentStart;
            this.#modes.push({ kind: 'text', start, form });

            return { type: 'interpolated-string-start', start, end: this.#offset, quote, delimiter: form.length };
        }

        let offset = start + 1;

        while (offset < this.#text.length && SPACE.test(this.#text[offset])) {
            offset++;
        }

        const message = offset > start + 1 && (this.#text[offset] === '"' || this.#text[offset] === "'") ? `An interpolated string starts with '$${this.#text[offset]}', with no space between them` : "Unexpected '$'";

        return this.#invalid(start, start + 1, message, start);
    }

    /**
     * Reads at the offset in an interpolated string's text: what closes it, its closing quote or a block's closing delimiter, the `{` that opens an interpolation, or a run of its text up to either,
     * scanned as its form reads text. A lone `}` and an escape the language has none of make the run invalid, as text never closed does, which ends the string at the end of the text.
     */
    #readText() {
        const start = this.#offset;
        const mode = this.#modes.at(-1);
        const { form } = mode;
        const isLineStart = form.isBlock && (start === form.contentStart || Tokenizer.#isLineBreak(this.#text[start - 1]));

        if (form.isBlock ? start >= form.contentEnd : this.#text[start] === form.quote && !(form.isRaw && this.#text[start + 1] === form.quote)) {
            this.#modes.pop();
            this.#offset = form.isBlock ? form.closingEnd : start + 1;

            return { type: 'interpolated-string-end', start, end: this.#offset, quote: form.quote, delimiter: form.length };
        }

        if (!isLineStart && this.#text[start] === '{' && this.#text[start + 1] !== '{') {
            this.#modes.push({ kind: 'interpolation', depth: 0, isFirst: true });
            this.#offset = start + 1;

            return { type: 'interpolation-start', start, end: this.#offset };
        }

        const scanned = this.#scanText(start, form, true);

        if (scanned.stop === 'end') {
            this.#modes.pop();

            const names = DELIMITED_NAMES[form.quote];

            return this.#invalid(start, scanned.end, scanned.diagnostic?.message ?? `An interpolated ${names[0]} is never closed`, scanned.diagnostic?.offset ?? mode.start);
        }

        if (scanned.diagnostic !== null) {
            return this.#invalid(start, scanned.end, scanned.diagnostic.message, scanned.diagnostic.offset);
        }

        this.#offset = scanned.end;

        return { type: 'interpolated-text', value: scanned.value, start, end: scanned.end };
    }

    /** Reads the escape whose backslash is at the offset: the character it stands for and where it ends, or the message that says why it is none the language has. */
    #readEscape(offset) {
        const escaped = this.#text[offset + 1];

        if (escaped !== 'u') {
            return Object.hasOwn(ESCAPES, escaped ?? '')
                ? { character: ESCAPES[escaped], end: offset + 2 }
                : { message: 'A string escapes only \\", \\\\, \\n, \\r, \\t, \\e and \\u{…}' };
        }

        UNICODE_ESCAPE.lastIndex = offset + 1;

        const match = UNICODE_ESCAPE.exec(this.#text);

        if (match === null) {
            return { message: 'A Unicode escape is written \\u{…} with one to six hexadecimal digits, as \\u{1F600}' };
        }

        const codePoint = Number.parseInt(match[1], 16);

        if (codePoint >= 0xD800 && codePoint <= 0xDFFF) {
            return { message: 'A Unicode escape names a scalar value, and D800 to DFFF are surrogates' };
        }

        if (codePoint > 0x10FFFF) {
            return { message: 'A Unicode escape names a value no greater than 10FFFF' };
        }

        return { character: String.fromCodePoint(codePoint), end: UNICODE_ESCAPE.lastIndex };
    }

    #readNumber(start) {
        NUMBER.lastIndex = start;

        if (!NUMBER.test(this.#text)) {
            return this.#invalid(start, start + 1, 'A number is written as in JSON', start);
        }

        this.#offset = NUMBER.lastIndex;

        return { type: 'literal', value: Number(this.#text.slice(start, this.#offset)), start, end: this.#offset };
    }

    /** An invalid token over the text from the start to the end, which reading goes on after, with the message and the offset its diagnostic gives. */
    #invalid(start, end, message, offset) {
        this.#offset = end;

        return { type: 'invalid', start, end, diagnostic: { message, offset } };
    }
}
