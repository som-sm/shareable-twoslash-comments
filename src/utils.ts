import { Sandbox } from "./vendor/sandbox";
import type { QuickInfo } from "typescript";

const twoSlashQueryRegex = /(^[ \t]*)(\/\/\s*\^\?)/gm;
const twoSlashArrowQueryRegex = /(^.*)\/\/=>/gm;

export async function fillTwoSlashQueries(
  sandbox: Sandbox,
  isUndoRedoChange: boolean = false,
): Promise<void> {
  const multilineEnabled =
    localStorage.getItem("shareable-twoslash-comments/enable-multiline-comments") === "true";
  const truncationDisabled =
    localStorage.getItem("shareable-twoslash-comments/disable-truncation") === "true";
  const compactOutputEnabled =
    localStorage.getItem("shareable-twoslash-comments/compact-output") === "true";
  const pauseOnError =
    localStorage.getItem("shareable-twoslash-comments/pause-on-error") === "true";
  const model = sandbox.getModel();
  const worker = await sandbox.getWorkerProcess();

  async function getLeftMostQuickInfo({
    line,
    column,
  }: {
    line: number;
    column: number;
  }): Promise<string> {
    for (let col = column; col <= model.getLineContent(line).length; col++) {
      const quickInfoPos = new sandbox.monaco.Position(line, col);
      const quickInfoOffset = model.getOffsetAt(quickInfoPos);

      const quickInfo = await worker.getQuickInfoAtPosition(
        "file://" + model.uri.path,
        quickInfoOffset,
      );

      if (quickInfo?.displayParts) {
        return compactOutputEnabled
          ? extractTypeFromDisplayParts(quickInfo.displayParts)
          : quickInfo.displayParts.map(({ text }) => text).join("");
      }
    }

    return "";
  }

  function extractTypeFromDisplayParts(
    displayParts: NonNullable<QuickInfo["displayParts"]>,
  ): string {
    // For interfaces and enums, return everything after the keyword.
    const keywordIndex = displayParts.findIndex(
      (part) => part.kind === "keyword" && ["interface", "enum"].includes(part.text),
    );

    if (keywordIndex !== -1) {
      return displayParts
        .slice(keywordIndex + 1)
        .map((part) => part.text)
        .join("")
        .trim();
    }

    let depth = 0;
    const separatorIndex = displayParts.findIndex((part) => {
      if (part.kind === "punctuation") {
        if (["(", "{", "<"].includes(part.text)) {
          depth++;
        } else if ([")", "}", ">"].includes(part.text)) {
          depth--;
        } else if (part.text === ":" && depth === 0) {
          return true;
        }
      } else if (part.kind === "operator" && part.text === "=" && depth === 0) {
        return true;
      }

      return false;
    });

    // If `separatorIndex` is `-1` (not found), return the entire thing.
    return displayParts
      .slice(separatorIndex + 1)
      .map(({ text }) => text)
      .join("")
      .trim();
  }

  function getPreviousQuickInfoComment({ lineNumber }: { lineNumber: number }): string {
    const prevQuickInfoLines: string[] = [model.getLineContent(lineNumber)];

    for (
      let currLineNumber = lineNumber + 1;
      currLineNumber <= model.getLineCount();
      currLineNumber++
    ) {
      const lineContent = model.getLineContent(currLineNumber);

      /* 
      Non-first lines in plugin generated comments are guaranteed to have 3 spaces after `//`.
      ```
      let foo = {bar: 1};
      foo
      //^? let foo: {
      //       bar: number; [[ 3 spaces after `//` ]]
      //   } [[ 3 spaces after `//` ]]
      ```
      */
      if (!/^ *\/\/ {3}/.test(lineContent)) {
        break;
      }

      prevQuickInfoLines.push(lineContent);
    }

    return prevQuickInfoLines.join(model.getEOL());
  }

  if (pauseOnError) {
    const diagnostics = await Promise.all([
      worker.getSyntacticDiagnostics("file://" + model.uri.path),
      worker.getSemanticDiagnostics("file://" + model.uri.path),
    ]);
    if (diagnostics.flat().length > 0) {
      return;
    }
  }

  const text = model.getValue();
  const editOperations: import("monaco-editor").editor.IIdentifiedSingleEditOperation[] = [];

  const matches = Array.from(text.matchAll(twoSlashQueryRegex))
    .map((match) => ({
      match,
      queryType: "twoSlashQuery" as "twoSlashQuery" | "twoSlashArrowQuery",
    }))
    .concat(
      Array.from(text.matchAll(twoSlashArrowQueryRegex)).map((match) => ({
        match,
        queryType: "twoSlashArrowQuery",
      })),
    );

  for (const { match, queryType } of matches) {
    const textBeforeQuery = match[1];
    const commentPrefix = `${" ".repeat(textBeforeQuery.length)}//`.padEnd(match[0].length + 1);
    const isInlineArrowQuery =
      queryType === "twoSlashArrowQuery" && textBeforeQuery.trim().length > 0;

    let lineNumber = model.getPositionAt(match.index).lineNumber;
    let column = model.getLineMinColumn(lineNumber);

    if (queryType === "twoSlashQuery") {
      /**
       * Zero-based index of the caret (`^`) position.
       *
       * @example
       * ```markdown
       * |  0 |  1 |  2 |  3 |  4 |  5 |  6 |  7 |  8 |  9 | 10 | 11 | 12 |
       * |  l |  e |  t |    |  f |  o |  o |    |  = |    |  5 |  ; | \n |
       * | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
       * |    |    |  / |  / |    |    |  ^ |  ? |
       * ```
       * If the editor contains the above text, then the caret position would be `19`.
       */
      /* 
      Calculation logic:
      For the above example, `match.index` would be `13`, and `match[0].length` would be `8` (`13` to `20`).
      So, subtracting `2` from the sum of these two values would give us the caret position i.e. `19`.
      */
      const caretOffset = match.index + match[0].length - 2;
      const caretPos = model.getPositionAt(caretOffset);

      lineNumber = caretPos.lineNumber;
      column = caretPos.column;
    }

    const quickInfoLine = lineNumber - (isInlineArrowQuery ? 0 : 1);
    if (quickInfoLine < 1) {
      continue;
    }

    const quickInfoString = await getLeftMostQuickInfo({ line: quickInfoLine, column });

    const quickInfoComment = `${match[0]}${quickInfoString.length > 0 ? " " : ""}${
      multilineEnabled
        ? quickInfoString.replace(/\r?\n/g, model.getEOL() + commentPrefix)
        : truncate(
            quickInfoString.replace(/\r?\n\s*/g, " "),
            truncationDisabled ? Number.POSITIVE_INFINITY : 100,
          )
    }`;

    const prevQuickInfoComment = getPreviousQuickInfoComment({ lineNumber });
    const prevQuickInfoLines = prevQuickInfoComment.split("\n").length;
    const prevQuickInfoEndLine = lineNumber + prevQuickInfoLines - 1;

    if (prevQuickInfoComment !== quickInfoComment) {
      editOperations.push({
        range: new sandbox.monaco.Range(
          lineNumber,
          0,
          prevQuickInfoEndLine,
          model.getLineContent(prevQuickInfoEndLine).length + 1,
        ),
        text: quickInfoComment,
      });
    }
  }

  if (editOperations.length > 0) {
    if (!isUndoRedoChange) {
      model.popStackElement();
    }

    try {
      if (isUndoRedoChange) {
        model.applyEdits(editOperations);
      } else {
        sandbox.editor.executeEdits("shareable-twoslash-comments", editOperations);
      }
    } finally {
      if (!isUndoRedoChange) {
        model.pushStackElement();
      }
    }
  }
}

export function debounce<Fn extends (...args: any[]) => any>(
  callback: Fn,
  delay: number = 1000,
): (...args: Parameters<Fn>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (...args: Parameters<Fn>): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      callback(...args);
      timeoutId = undefined;
    }, delay);
  };
}

function truncate(str: string, maxLength: number): string {
  return str.length > maxLength ? str.slice(0, maxLength) + "…" : str;
}
