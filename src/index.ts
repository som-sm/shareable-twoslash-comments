import type { PlaygroundPlugin, PluginUtils } from "./vendor/playground";
import { fillTwoSlashQueries } from "./utils";

const makePlugin = (utils: PluginUtils) => {
  const customPlugin: PlaygroundPlugin = {
    id: "shareable-twoslash-comments",
    displayName: "Shareable Twoslash Comments",
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
        ],
        {
          style: "separated",
        },
      );
    },

    // This is called occasionally as text changes in monaco,
    // it does not directly map 1 keyup to once run of the function
    // because it is intentionally called at most once every 0.3 seconds
    // and then will always run at the end.
    modelChangedDebounce: async (sandbox, model) => {
      fillTwoSlashQueries(sandbox);
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
