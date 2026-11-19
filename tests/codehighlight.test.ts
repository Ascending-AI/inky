import { describe, expect, it } from "vitest";
import { codeBlockText, highlightCode, isShellSession } from "$lib/codehighlight";

describe("highlightCode", () => {
  it("colours a named language and labels it by its proper name", () => {
    const r = highlightCode("def load(path):\n    return path", "py");
    expect(r.language).toBe("python");
    expect(r.label).toBe("Python");
    expect(r.html).toContain('<span class="hljs-keyword">def</span>');
    expect(r.shell).toBe(false);
  });

  it("guesses the language of an unlabelled block: colours, but no label", () => {
    const r = highlightCode("const x = await fetch(url);\nif (!x.ok) throw new Error(\"bad\");", "");
    expect(r.language).toBe("javascript");
    expect(r.label).toBe("");
    expect(r.html).toContain("hljs-keyword");
  });

  it("leaves prose-like unlabelled text plain rather than guessing wildly", () => {
    const r = highlightCode("just some words in a block\nnothing code like here", "");
    expect(r.language).toBe("plaintext");
    expect(r.html).not.toContain("hljs-");
  });

  it("escapes HTML in code", () => {
    expect(highlightCode("<script>alert(1)</script>", "").html).not.toContain("<script>");
    expect(highlightCode("<b>x</b>", "nonsense-lang").html).toContain("&lt;b&gt;");
  });

  it("keeps an unknown language name as the label, plain text inside", () => {
    const r = highlightCode("anything", "brainfuck");
    expect(r.language).toBe("plaintext");
    expect(r.label).toBe("brainfuck");
    expect(highlightCode("anything", "text").label).toBe("");
  });

  it("treats terminal sessions as shell: prompt marked, label Terminal", () => {
    const r = highlightCode("$ pnpm test\n Tests  140 passed", "bash");
    expect(r.shell).toBe(true);
    expect(r.label).toBe("Terminal");
    expect(r.html).toContain('class="hljs-meta prompt_"');
    expect(highlightCode("$ ls -la", "").shell).toBe(true);
    expect(highlightCode("ls -la", "console").shell).toBe(true);
  });

  it("keeps bash scripts (with # comments) as bash, not a session", () => {
    const r = highlightCode("# install\npnpm install\nmake dev", "bash");
    expect(r.shell).toBe(false);
    expect(r.label).toBe("Shell");
    expect(r.html).toContain("hljs-comment");
  });
});

describe("isShellSession", () => {
  it("needs the first command line to start with a $ prompt", () => {
    expect(isShellSession("$ make\nok")).toBe(true);
    expect(isShellSession("\n  $ make")).toBe(true);
    expect(isShellSession("echo $HOME")).toBe(false);
    expect(isShellSession("# comment\n$ make")).toBe(false);
  });
});

describe("JSON layout", () => {
  it("indents compact JSON for reading", () => {
    const r = highlightCode('{"name":"inky","tags":["md","mcp"],"open":true}', "json");
    expect(r.text).toBe('{\n  "name": "inky",\n  "tags": ["md", "mcp"],\n  "open": true\n}');
    expect(r.html).toContain("hljs-attr");
    expect(r.label).toBe("JSON");
  });

  it("recognises unlabelled JSON and lays it out", () => {
    const r = highlightCode('[{"a":1},{"a":2}]', "");
    expect(r.text).toBe('[\n  {\n    "a": 1\n  },\n  {\n    "a": 2\n  }\n]');
    expect(r.language).toBe("json");
    expect(r.text.split("\n").length).toBeGreaterThan(3);
  });

  it("lays out JSON that is wrapped by hand but not indented", () => {
    const src = [
      '{"schema": "fulcrum.ledger/1", "attempt": "att_7f3a", "seq": 14, "t": 9.8,',
      ' "kind": "tool.write", "args": {"to": "mark@example.com"}, "external": true,',
      ' "rules_fired": ["R1"], "prev": "sha256:9c1e…"}',
    ].join("\n");
    expect(highlightCode(src, "json").text).toBe(
      [
        "{",
        '  "schema": "fulcrum.ledger/1",',
        '  "attempt": "att_7f3a",',
        '  "seq": 14,',
        '  "t": 9.8,',
        '  "kind": "tool.write",',
        '  "args": {',
        '    "to": "mark@example.com"',
        "  },",
        '  "external": true,',
        '  "rules_fired": ["R1"],',
        '  "prev": "sha256:9c1e…"',
        "}",
      ].join("\n"),
    );
  });

  it("is stable on JSON already laid out this way", () => {
    const src = '{\n  "a": 1,\n  "tags": ["x", "y"]\n}';
    expect(highlightCode(src, "json").text).toBe(src);
  });

  it("leaves invalid JSON as written", () => {
    const src = '{"a": 1, oops}';
    expect(highlightCode(src, "json").text).toBe(src);
  });

  it("breaks long lists of plain values over lines", () => {
    const items = Array.from({ length: 12 }, (_, i) => `"item-${i}"`).join(",");
    const text = highlightCode(`{"l":[${items}]}`, "json").text;
    expect(text).toContain('"l": [\n    "item-0",\n');
  });

  it("keeps numbers and strings exactly as written", () => {
    const r = highlightCode('{"id":12345678901234567890,"price":1.50,"s":"a,{b}:c","e":{},"l":[]}', "json");
    expect(r.text).toBe(
      '{\n  "id": 12345678901234567890,\n  "price": 1.50,\n  "s": "a,{b}:c",\n  "e": {},\n  "l": []\n}',
    );
  });
});

describe("codeBlockText", () => {
  function block(markdownLang: string, code: string) {
    const r = highlightCode(code, markdownLang);
    const pre = document.createElement("pre");
    if (r.shell) pre.className = "code-block code-shell";
    pre.innerHTML = `<code>${r.html}</code>`;
    return pre;
  }

  it("copies a code block's text", () => {
    expect(codeBlockText(block("python", "x = 1\nprint(x)"))).toBe("x = 1\nprint(x)");
  });

  it("copies only the commands of a terminal session, without prompts or output", () => {
    const pre = block("console", "$ pnpm install\nDone in 4.9s\n$ make dev\nserving…");
    expect(codeBlockText(pre)).toBe("pnpm install\nmake dev");
  });
});
