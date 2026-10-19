"use client";

import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";

function languageFor(path: string): Extension[] {
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) {
    return [javascript({ jsx: true, typescript: true })];
  }
  if (/\.py$/.test(path)) return [python()];
  if (/\.html?$/.test(path)) return [html()];
  if (/\.css$/.test(path)) return [css()];
  if (/\.json$/.test(path)) return [json()];
  if (/\.mdx?$/.test(path)) return [markdown()];
  return [];
}

export function CodeEditor({
  path,
  content,
  onChange,
}: {
  path: string;
  content: string;
  onChange: (content: string) => void;
}) {
  return (
    <div className="h-full overflow-hidden" data-testid="codestudio-editor">
      <CodeMirror
        value={content}
        onChange={onChange}
        extensions={languageFor(path)}
        theme="dark"
        height="100%"
        style={{ height: "100%", fontSize: 12 }}
      />
    </div>
  );
}
