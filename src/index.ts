import type { PlaygroundPlugin, PluginUtils } from "./vendor/playground";
import { debounce, fillTwoSlashQueries } from "./utils";

const debouncedFillTwoSlashQueries = debounce(fillTwoSlashQueries, 600);

const makePlugin = (utils: PluginUtils) => {
  const customPlugin: PlaygroundPlugin = {
    id: "shareable-twoslash-comments",
    displayName: "Shareable Twoslash Comments",
    data: { firstMount: true },
    didMount: (sandbox, container) => {
      // Create a design system object to handle
      // making DOM elements which fit the playground (and handle mobile/light/dark etc)
      const ds = utils.createDesignSystem(container);

      ds.p(
        "This plugin embeds twoslash (// ^?) type hints as literal comments in your code, making them easy to copy and share.",
      );

      ds.showOptionList(
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
        ],
        {
          style: "separated",
        },
      );

      const model = sandbox.getModel();
      if (customPlugin.data.firstMount) {
        model.onDidChangeContent(() => {
          debouncedFillTwoSlashQueries(sandbox);
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
