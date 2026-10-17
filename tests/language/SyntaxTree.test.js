import { describe, it, expect } from 'vitest';
import { domql } from '#domql/domql.js';
import { Lowering } from '#domql/language/Lowering.mjs';
import { ParsedTexts } from '#domql/language/ParsedTexts.mjs';
import { Parser } from '#domql/language/Parser.mjs';
import { NODE_KINDS, SyntaxTree } from '#domql/language/SyntaxTree.mjs';
import { TOKEN_TYPES, Tokenizer } from '#domql/language/Tokenizer.mjs';

const treeOf = text => new Parser(text).parse();

/** The node kinds of the tree, outermost first, tokens left out. */
const kindsOf = node => (SyntaxTree.isToken(node) ? [] : [node.kind, ...node.children.flatMap(kindsOf)]);

describe('SyntaxTree', () => {
    it.each([
        '@panel',
        '  @panel.size  ',
        '// A panel.\n@panel { /* its\nfirst item */ open: self.first(".item") /* inline */.matches(/**/".open") // whether it is open\n}\n',
        '@panel {\n    let rows: self.all("tr"),\n\n    count: rows.count,\n    first: rows:[0]?:["data-key"]\n}',
        'if let n: @a to "number" then n elseif @b then 1 else (?@panel.parent.rect).width',
        '\t(@a ?? @b)\tas "element"',
        '(?(@panel.parent as "element").rect.width) == null and not @x != @y or (try @v to"number" ?? 0)',
        '@a/* the value */to/* its type */"number"',
        '{ say: "say \\"hi\\" \\\\ // not a comment" }',
        '@list:item[@i]?.size // trailing comment with no line feed',
    ])('reconstructs its text exactly, whitespace and comments included: %j', text => {
        expect(SyntaxTree.textOf(treeOf(text))).toBe(text);
    });

    it('holds every character of the text in one token or in the trivia before one, the end of the text in the end token', () => {
        const text = ' /* a */ @a . b // c\n';
        const tokens = [...SyntaxTree.tokensOf(treeOf(text))];

        expect(tokens.map(token => text.slice(token.start, token.end))).toEqual(['@a', '.', 'b', '']);
        expect(tokens.map(token => text.slice(token.leading, token.start))).toEqual([' /* a */ ', ' ', ' ', ' // c\n']);
        expect(tokens.every((token, index) => index === 0 ? token.leading === 0 : token.leading === tokens[index - 1].end)).toBe(true);
    });

    it('splits a token\'s trivia into whitespace, line comments and block comments', () => {
        const text = '  // one\n /* two */\t@a';
        const [token] = SyntaxTree.tokensOf(treeOf(text));

        expect(SyntaxTree.triviaOf(token, text).map(piece => [piece.kind, text.slice(piece.start, piece.end)])).toEqual([
            ['whitespace', '  '],
            ['line-comment', '// one\n'],
            ['whitespace', ' '],
            ['block-comment', '/* two */'],
            ['whitespace', '\t'],
        ]);
    });

    it('names each node after the grammar rule that produces it, a rule that passes an operand on giving none', () => {
        expect(kindsOf(treeOf('@panel'))).toEqual(['query']);
        expect(kindsOf(treeOf('@a == @b and @c'))).toEqual(['query', 'conjunction', 'equality']);
        expect(kindsOf(treeOf('@panel.closest(".row")?.rect { top: self.top }'))).toEqual(['query', 'chain', 'member-access-expression', 'call-expression', 'member-access-expression', 'object', 'field', 'chain', 'member-access-expression']);
        expect(kindsOf(treeOf('(?@a.b) ?? (@c as "node")'))).toEqual(['query', 'coalescing-operator', 'optional-access-group', 'member-access-chain', 'member-access-expression', 'expression-group', 'cast']);
        expect(kindsOf(treeOf('if let v: @a then v else 0'))).toEqual(['query', 'conditional-expression', 'conditional-binding']);
    });

    it('starts and ends a node at its first and last tokens, its trivia left out', () => {
        const text = '  ( @a ?? @b )  ';
        const [group] = treeOf(text).children;

        expect([SyntaxTree.startOf(group), SyntaxTree.endOf(group)]).toEqual([2, 14]);
    });

    it('publishes every node kind the parser builds and every token type the tokenizer reads', () => {
        const texts = [
            'if let v: @a then v elseif not @b then 1 else 2',
            '@a == @b and @c != @d or (try @e to "number" ?? 0)',
            '(?(@panel.parent as "element").rect.width) ?? @panel.closest(".row")?.rect { top: self.top }',
            '@panel { let rows: self.all("i"), first: rows:[0]?:["data-key"], name: self[@name], open: self.matches(".x") }',
        ];
        const kinds = new Set(texts.flatMap(text => kindsOf(treeOf(text))));
        const types = new Set(texts.flatMap(text => Tokenizer.scan(text).map(token => token.type)).concat(Tokenizer.scan('@a = 1').map(token => token.type)));

        expect([...kinds].filter(kind => !NODE_KINDS.includes(kind))).toEqual([]);
        expect(NODE_KINDS.filter(kind => !kinds.has(kind))).toEqual([]);
        expect([...types].filter(type => !TOKEN_TYPES.includes(type))).toEqual([]);
    });

    it.each([
        ['an unexpected character', '@a # @b', '#', "Unexpected '#'"],
        ['a single equals sign', '@a = 1', '=', "Unexpected '='"],
        ['a string never closed', '@a:["key', '"key', 'A string is never closed'],
        ['an escape no escape is for', '"a\\nb" == @x', '"a\\nb"', 'A string escapes only'],
        ['a block comment never closed', '@a /* open', '/* open', 'A block comment is never closed'],
        ['a hyphen after a name', '@panel.client-size', 'client-', 'A name holds no hyphen'],
        ['a parameter with no name', '@ panel', '@', "A parameter is written as '@' and its name"],
        ['a parameter named by a reserved word', '@null.size', '@null', "'@null' names no parameter"],
    ])('scans text that is no token, %s, into an invalid token with its diagnostic, reading on after it', (_, text, invalidText, message) => {
        const tokens = Tokenizer.scan(text);
        const invalid = tokens.find(token => token.type === 'invalid');

        expect(text.slice(invalid.start, invalid.end)).toBe(invalidText);
        expect(invalid.diagnostic.message).toContain(message);
        expect(tokens.map(token => text.slice(token.leading, token.end)).join('')).toBe(text);
        expect(tokens.at(-1).type).toBe('end');
        expect(() => new Tokenizer(text).tokenize()).toThrow(message);
    });

    it('keeps the text a query was made from beside its definition, from which its tree is read again, and none for a query made from a definition', () => {
        const text = '@panel {\n    // its size\n    size: self.size\n}';
        const query = domql.query(text);

        expect(SyntaxTree.textOf(treeOf(ParsedTexts.textOf(query.definition)))).toBe(text);
        expect(ParsedTexts.textOf(domql.query(query.definition).definition)).toBeNull();
    });

    it('lowers into the definition a query of the text holds, which keeps nothing of the tree', () => {
        const text = '@panel { let rows: self.all("i"), first: rows:[0]?:["data-key"] }';
        const { definition } = Lowering.lower(treeOf(text));

        expect(definition).toEqual(domql.query(text).definition);
        expect(JSON.stringify(definition)).not.toMatch(/children|leading|spaced/);
    });
});
