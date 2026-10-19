# Security policy

## Report a vulnerability

Please report possible vulnerabilities privately through either of these channels:

- Open the repository's **Security** tab and choose **Report a vulnerability**.
- Email [domql@formaui.net](mailto:domql@formaui.net).

Include the affected DOMQL version, a description of the impact and the smallest example you can provide to reproduce it. Query text or definitions, relevant markup and browser details are helpful. Please leave out credentials and other private data.

We will reply after reviewing your report. Reports remain private until a fix is available or we agree on disclosure with you. Please avoid posting vulnerability details in a public issue.

## Supported versions

DOMQL is in preview. Only the latest version receives fixes.

## Scope

DOMQL queries read DOM state and return detached data. Please report cases where DOMQL violates that contract, including:

- A read query changes the document, executes script or accesses data outside its intended access.
- A result exposes a live DOM reference instead of detached data.
- Crafted query text or a definition causes a hang, unbounded resource use or an unexpected failure outside DOMQL's `LexicaError` handling.

Actions and behaviors are separate operations that can intentionally change the page. Extension modules run with the authority of the application that registers them; DOMQL does not sandbox their JavaScript. A registered module's own behavior is the host application's responsibility.

If you are unsure whether an issue is security-related, use one of the private reporting channels above.
