import { Sandbox } from "./vendor/sandbox";

const twoSlashQueryRegex = /(^[ \t]*)(\/\/\s*\^\?)/gm;

export async function fillTwoSlashQueries(sandbox: Sandbox): Promise<void> {
  const multilineEnabled =
    localStorage.getItem("shareable-twoslash-comments/enable-multiline-comments") === "true";
  const truncationDisabled =
    localStorage.getItem("shareable-twoslash-comments/disable-truncation") === "true";
  const model = sandbox.getModel();
  const worker = await sandbox.getWorkerProcess();

  const diagnostics = await Promise.all([
    worker.getSyntacticDiagnostics("file://" + model.uri.path),
    worker.getSemanticDiagnostics("file://" + model.uri.path),
  ]);
  if (diagnostics.flat().length > 0) {
    return;
  }

  const text = model.getValue();
  const editOperations: import("monaco-editor").editor.IIdentifiedSingleEditOperation[] = [];

  for (const match of Array.from(text.matchAll(twoSlashQueryRegex))) {
    const commentPrefix = `${match[1]}//`.padEnd(match[0].length + 1);

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

    const quickInfoPos = new sandbox.monaco.Position(caretPos.lineNumber - 1, caretPos.column);
    const quickInfoOffset = model.getOffsetAt(quickInfoPos);

    const quickInfo = await worker.getQuickInfoAtPosition(
      "file://" + model.uri.path,
      quickInfoOffset,
    );

    const quickInfoString = quickInfo?.displayParts?.map((d) => d.text).join("") ?? "";

    const quickInfoComment = `${match[0]}${quickInfoString.length > 0 ? " " : ""}${
      multilineEnabled
        ? quickInfoString.replace(/\r?\n/g, model.getEOL() + commentPrefix)
        : truncate(
            quickInfoString.replace(/\r?\n\s*/g, " "),
            truncationDisabled ? Number.POSITIVE_INFINITY : 100,
          )
    }`;

    const prevQuickInfoComment = getPreviousQuickInfoComment({
      model,
      lineNumber: caretPos.lineNumber,
      commentPrefix,
    });
    const prevQuickInfoLines = prevQuickInfoComment.split("\n").length;
    const prevQuickInfoEndLine = caretPos.lineNumber + prevQuickInfoLines - 1;

    if (prevQuickInfoComment !== quickInfoComment) {
      editOperations.push({
        range: new sandbox.monaco.Range(
          caretPos.lineNumber,
          0,
          prevQuickInfoEndLine,
          model.getLineContent(prevQuickInfoEndLine).length + 1,
        ),
        text: quickInfoComment,
      });
    }
  }

  if (editOperations.length > 0) {
    model.applyEdits(editOperations);
  }
}

function getPreviousQuickInfoComment({
  model,
  lineNumber,
  commentPrefix,
}: {
  model: import("monaco-editor").editor.ITextModel;
  lineNumber: number;
  commentPrefix: string;
}): string {
  const prevQuickInfoLines: string[] = [model.getLineContent(lineNumber)];

  for (
    let currLineNumber = lineNumber + 1;
    currLineNumber <= model.getLineCount();
    currLineNumber++
  ) {
    const lineContent = model.getLineContent(currLineNumber);

    if (!lineContent.startsWith(commentPrefix)) {
      break;
    }

    prevQuickInfoLines.push(lineContent);
  }

  return prevQuickInfoLines.join(model.getEOL());
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
