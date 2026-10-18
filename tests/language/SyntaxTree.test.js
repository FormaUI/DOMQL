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
        'panel',
        '  panel.size  ',
        '// A panel.\npanel { /* its\nfirst item */ open = context.first(".item") /* inline */.matches(/**/".open") // whether it is open\n}\n',
        'panel {\n    let rows = context.all("tr"),\n\n    count = rows.count,\n    first = rows:[0]?:["data-key"]\n}',
        'if let n = a to "number" then n elseif b then 1 else (?panel.parent.rect).width end',
        '\t(a ?? b)\tas "element"',
        '(?(panel.parent as "element").rect.width) == null and not x != y or (try v to"number" ?? 0)',
        'a/* the value */to/* its type */"number"',
        '{ say = "say \\"hi\\" \\\\ // not a comment" }',
        'list:item[i]?.size // trailing comment with no line feed',
        '$"a {{b}} {  c ?? "}" /* } */ } and {$"{ { d = 1 }.d}"}\\u{7B}"',
    ])('reconstructs its text exactly, whitespace and comments included: %j', text => {
        expect(SyntaxTree.textOf(treeOf(text))).toBe(text);
    });

    it('reads an interpolated string as its start, its runs of text, the tokens around and within each hole, and its end, a hole\'s own braces told from its object expressions\'', () => {
        const tokens = Tokenizer.scan('$"a {{ {b { c = 1 }.c} d"').map(token => token.type === 'interpolated-text' ? [token.type, token.value] : token.type);

        expect(tokens).toEqual(['interpolated-string-start', ['interpolated-text', 'a { '], 'interpolation-start', 'name', '{', 'name', '=', 'literal', '}', '.', 'name', 'interpolation-end', ['interpolated-text', ' d'], 'interpolated-string-end', 'end']);
    });

    it('holds every character of the text in one token or in the trivia before one, the end of the text in the end token', () => {
        const text = ' /* a */ a . b // c\n';
        const tokens = [...SyntaxTree.tokensOf(treeOf(text))];

        expect(tokens.map(token => text.slice(token.start, token.end))).toEqual(['a', '.', 'b', '']);
        expect(tokens.map(token => text.slice(token.leading, token.start))).toEqual([' /* a */ ', ' ', ' ', ' // c\n']);
        expect(tokens.every((token, index) => index === 0 ? token.leading === 0 : token.leading === tokens[index - 1].end)).toBe(true);
    });

    it('splits a token\'s trivia into whitespace, line comments and block comments', () => {
        const text = '  // one\n /* two */\ta';
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
        expect(kindsOf(treeOf('panel'))).toEqual(['query']);
        expect(kindsOf(treeOf('a == b and c'))).toEqual(['query', 'conjunction', 'equality']);
        expect(kindsOf(treeOf('panel.closest(".row")?.rect { top = context.top }'))).toEqual(['query', 'chain', 'member-call', 'dot-property-access', 'object', 'field', 'chain', 'dot-property-access']);
        expect(kindsOf(treeOf('(?a.b) ?? (c as "node")'))).toEqual(['query', 'coalescing', 'optional-enclosed-access', 'member-chain', 'dot-property-access', 'parenthesized-expression', 'cast']);
        expect(kindsOf(treeOf('if let v = a then v else 0 end'))).toEqual(['query', 'conditional-expression', 'conditional-binding']);
        expect(kindsOf(treeOf('panel[name]?:attribute["id"]'))).toEqual(['query', 'chain', 'bracket-property-access', 'indexer']);
    });

    it('starts and ends a node at its first and last tokens, its trivia left out', () => {
        const text = '  ( a ?? b )  ';
        const [group] = treeOf(text).children;

        expect([SyntaxTree.startOf(group), SyntaxTree.endOf(group)]).toEqual([2, 12]);
    });

    it('publishes every node kind the parser builds and every token type the tokenizer reads', () => {
        const texts = [
            'if let v = a then v elseif not b then 1 else 2 end',
            'a == b and c != d or (try e to "number" ?? 0)',
            '(?(panel.parent as "element").rect.width) ?? panel.closest(".row")?.rect { top = context.top }',
            'panel { let rows = context.all("i"), first = rows:[0]?:["data-key"], name = context[name], open = context.matches(".x") }',
            '-a * 2 + b % 3 - c / d',
            '0 < a <= 1 and b > c >= d',
            '$"a {b}"',
            'let f = function(x, y) x end\nreturn f(1, 2)',
            'let a = 1\nreturn do let b = a return b end',
        ];
        const kinds = new Set(texts.flatMap(text => kindsOf(treeOf(text))));
        const types = new Set(texts.flatMap(text => Tokenizer.scan(text).map(token => token.type)).concat(Tokenizer.scan('a = 1').map(token => token.type)));

        expect([...kinds].filter(kind => !NODE_KINDS.includes(kind))).toEqual([]);
        expect(NODE_KINDS.filter(kind => !kinds.has(kind))).toEqual([]);
        expect([...types].filter(type => !TOKEN_TYPES.includes(type))).toEqual([]);
    });

    it.each([
        ['an unexpected character', 'a # b', '#', "Unexpected '#'"],
        ['a single exclamation mark', 'a ! 1', '!', "Unexpected '!': an inequality is written '!='"],
        ['a string never closed', 'a:["key', '"key', 'A string is never closed'],
        ['an escape no escape is for', '"a\\qb" == x', '"a\\qb"', 'A string escapes only'],
        ['a block comment never closed', 'a /* open', '/* open', 'A block comment is never closed'],
        ['an @ with a space after it', '@ to', '@', "A reserved word follows '@' directly, as @to"],
        ['an @ at the end of the text', 'a + @', '@', "A reserved word follows '@' directly, as @to"],
        ['an @ before what is no word', '@"to"', '@', "'@' and what follows it are no reserved reference"],
        ['an @ before a name that is no reserved word, which is written alone', '@panel.size', '@panel', "'panel' is no reserved word, so it is written alone: write 'panel', with no '@'"],
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
        const text = 'panel {\n    // its size\n    size = context.size\n}';
        const query = domql.query(text);

        expect(SyntaxTree.textOf(treeOf(ParsedTexts.textOf(query.definition)))).toBe(text);
        expect(ParsedTexts.textOf(domql.query(query.definition).definition)).toBeNull();
    });

    it('lowers into the definition a query of the text holds, which keeps nothing of the tree', () => {
        const text = 'panel { let rows = context.all("i"), first = rows:[0]?:["data-key"] }';
        const { definition } = Lowering.lower(treeOf(text));

        expect(definition).toEqual(domql.query(text).definition);
        expect(JSON.stringify(definition)).not.toMatch(/children|leading|spaced/);
    });
});
