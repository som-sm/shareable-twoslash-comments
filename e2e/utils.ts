import dedent from "dedent";

export function dedenter(strings: TemplateStringsArray, ...values: unknown[]): string[] {
  const result = dedent(strings, ...values);
  return result.split("\n");
}

export function undo() {
  const editor = (window as any).monaco.editor.getEditors()[0];
  editor.getModel().undo();
}

export function redo() {
  const editor = (window as any).monaco.editor.getEditors()[0];
  editor.getModel().redo();
}
