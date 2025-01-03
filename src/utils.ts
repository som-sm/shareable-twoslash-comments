import { Sandbox } from "./vendor/sandbox";

const twoSlashQueryRegex = /(^[ \t]*)(\/\/\s*\^\?)/gm;

export const fillTwoSlashQueries = async (sandbox: Sandbox): Promise<void> => {
  const multilineEnabled =
    localStorage.getItem("shareable-twoslash-comments/enable-multiline-comments") === "true";
  const model = sandbox.getModel();
  const worker = await sandbox.getWorkerProcess();
  const text = model.getValue();
  const editOperations: import("monaco-editor").editor.IIdentifiedSingleEditOperation[] = [];

  for (const match of Array.from(text.matchAll(twoSlashQueryRegex))) {
    const commentPrefix = `${match[1]}//`.padEnd(match[0].length + 1);

    const caretOffset = match.index + match[0].length - 1;
    const caretPos = model.getPositionAt(caretOffset);

    const quickInfoPos = new sandbox.monaco.Position(caretPos.lineNumber - 1, caretPos.column);
    const quickInfoOffset = model.getOffsetAt(quickInfoPos);

    const quickInfo = await worker.getQuickInfoAtPosition(
      "file://" + model.uri.path,
      quickInfoOffset,
    );

    if (!quickInfo?.displayParts) {
      continue;
    }

    const quickInfoString = quickInfo.displayParts.map((d) => d.text).join("");

    const quickInfoComment = `${match[0]} ${
      multilineEnabled
        ? quickInfoString.replace(/\r?\n/g, model.getEOL() + commentPrefix)
        : quickInfoString.replace(/\r?\n\s*/g, " ")
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
    model.pushEditOperations([], editOperations, () => null);
  }
};

type GetPreviousQuickInfo = (args: {
  model: import("monaco-editor").editor.ITextModel;
  lineNumber: number;
  commentPrefix: string;
}) => string;

const getPreviousQuickInfoComment: GetPreviousQuickInfo = ({
  model,
  lineNumber,
  commentPrefix,
}) => {
  const prevQuickInfoLines: string[] = [];

  for (let currLineNumber = lineNumber; currLineNumber <= model.getLineCount(); currLineNumber++) {
    const lineContent = model.getLineContent(currLineNumber);

    if (!(lineContent.startsWith(commentPrefix) || lineContent.search(twoSlashQueryRegex) !== -1)) {
      break;
    }

    prevQuickInfoLines.push(lineContent);
  }

  return prevQuickInfoLines.join(model.getEOL());
};
