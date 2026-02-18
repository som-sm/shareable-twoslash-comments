import type { PlaygroundPlugin, PluginUtils } from "./vendor/playground";
import { debounce, fillTwoSlashQueries } from "./utils";

const debouncedFillTwoSlashQueries = debounce(fillTwoSlashQueries, 500);

const makePlugin = (utils: PluginUtils) => {
  const customPlugin: PlaygroundPlugin = {
    id: "shareable-twoslash-comments",
    displayName: "Shareable Twoslash Comments",
    data: { firstMount: true },
    shouldBeSelected: () => true,
    didMount: (sandbox, container) => {
      container.style.paddingRight = "8px";

      // Create a design system object to handle
      // making DOM elements which fit the playground (and handle mobile/light/dark etc)
      const ds = utils.createDesignSystem(container);

      ds.p(
        "This plugin embeds twoslash (// ^?) type hints as literal comments in your code, making them easy to copy and share.",
      );

      const optionsContainer = document.createElement("div");
      Object.assign(optionsContainer.style, {
        backgroundColor: "var(--raised-background, rgba(0,0,0,0.05))",
        padding: "0 12px",
        margin: "8px 0",
        border: "1px solid var(--border-color, rgba(0,0,0,0.1))",
      });
      container.appendChild(optionsContainer);

      const optionsDs = utils.createDesignSystem(optionsContainer);
      optionsDs.showOptionList(
        [
          {
            blurb: "Preserve multiline types instead of collapsing them to a single line.",
            flag: "shareable-twoslash-comments/enable-multiline-comments",
            display: "Enable multiline comments",
            onchange: () => fillTwoSlashQueries(sandbox),
          },
          {
            blurb:
              "Prevent truncation of single line comments. Otherwise, they will be truncated to 100 characters.",
            flag: "shareable-twoslash-comments/disable-truncation",
            display: "Disable truncation",
            onchange: () => fillTwoSlashQueries(sandbox),
          },
          {
            blurb: "Pause comment generation if there are any errors in the code.",
            flag: "shareable-twoslash-comments/pause-on-error",
            display: "Pause on error",
            onchange: () => fillTwoSlashQueries(sandbox),
          },
        ],
        {
          style: "separated",
        },
      );

      ds.p("This plugin also supports twoslash arrow queries (//=>).");

      ds.p(
        "If placed at the end of a line, it finds the first position on that line with type information and inserts it.",
      );
      const code1 = "let foo = 1; //=> number";
      const code1El = ds.code(code1);
      if (code1El.parentElement) {
        code1El.parentElement.style.width = "auto";
      }
      sandbox.monaco.editor.colorize(code1, "typescript", {}).then((html) => {
        code1El.innerHTML = html;
      });

      ds.p(
        "If placed on its own line, it looks at the previous line, finds the first position with type information, and inserts it.",
      );
      const code2 = "let foo = 1;\n//=> number";
      const code2El = ds.code(code2);
      if (code2El.parentElement) {
        code2El.parentElement.style.width = "auto";
        code2El.parentElement.style.marginBottom = "8px";
      }
      sandbox.monaco.editor.colorize(code2, "typescript", {}).then((html) => {
        code2El.innerHTML = html;
      });

      const model = sandbox.getModel();
      if (customPlugin.data.firstMount) {
        debouncedFillTwoSlashQueries(sandbox);
        model.onDidChangeContent((e) => {
          if (e.isRedoing || e.isUndoing) {
            fillTwoSlashQueries(sandbox, true);
          } else {
            debouncedFillTwoSlashQueries(sandbox);
          }
        });
        customPlugin.data.firstMount = false;
      }
    },

    // This is called occasionally as text changes in monaco,
    // it does not directly map 1 keyup to once run of the function
    // because it is intentionally called at most once every 0.3 seconds
    // and then will always run at the end.
    modelChangedDebounce: async (_sandbox, _model) => {
      // Do some work with the new text
    },

    // Gives you a chance to remove anything set up,
    // the container itself if wiped of children after this.
    didUnmount: () => {
      console.log("De-focusing plugin");
    },
  };

  return customPlugin;
};

export default makePlugin;
