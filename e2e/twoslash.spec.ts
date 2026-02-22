import { test, expect } from "@playwright/test";
import lzString from "lz-string";
import dedent from "dedent";
import { dedenter, redo, undo } from "./utils";

const PLAYGROUND_BASE_URL = "https://www.typescriptlang.org/play/#code/";

const generatePlaygroundLink = (code: string): string => {
  const zippedCode = lzString.compressToEncodedURIComponent(code);
  return `${PLAYGROUND_BASE_URL}${zippedCode}`;
};

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["local-network-access"]);

  await page.goto("https://www.typescriptlang.org/play/?#code/Q");
  await page.getByRole("tab", { name: "Plugins" }).click();
  await page.getByRole("checkbox", { name: "Connect to localhost:5000" }).check();
  await page.reload();
});

test("fill query", async ({ page }) => {
  // Setup
  const editor = page.getByRole("textbox", { name: "Editor content" });

  // Act
  await editor.pressSequentially("let foo = 1; //=>");

  // Assert
  await expect(page.locator(".lines-content .view-line")).toHaveText([
    "let foo = 1; //=> let foo: number",
  ]);

  // Act
  await editor.press("Enter");
  await editor.pressSequentially("const bar = [1];");
  await editor.press("Enter");
  await editor.pressSequentially("//    ^?");

  // Assert
  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    let foo = 1; //=> let foo: number
    const bar = [1];
    //    ^? const bar: number[]
  `);

  // Act
  await editor.press("Enter");
  await editor.pressSequentially('let baz = {fizz: "buzz"};');
  await editor.press("Enter");
  await editor.pressSequentially("//=>");

  // Assert
  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    let foo = 1; //=> let foo: number
    const bar = [1];
    //    ^? const bar: number[]
    let baz = {fizz: "buzz"};
    //=> let baz: { fizz: string; }
  `);
});

test("update query", async ({ page }) => {
  const code = dedent`
    type Foo = {fizz: string; buzz: number};
    //=> type Foo = { fizz: string; buzz: number; }
    type Bar = {[P in keyof Foo as Uppercase<P>]: Foo[P]};
    //   ^? type Bar = { FIZZ: string; BUZZ: number; }
    type Baz = {[P in keyof Bar]: [Bar[P]]}; //=> type Baz = { FIZZ: [string]; BUZZ: [number]; }
  `;
  await page.goto(generatePlaygroundLink(code));
  const editor = page.getByRole("textbox", { name: "Editor content" });

  await page.getByText("fizz:", { exact: true }).dblclick();
  await editor.pressSequentially("test");

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    type Foo = {test: string; buzz: number};
    //=> type Foo = { test: string; buzz: number; }
    type Bar = {[P in keyof Foo as Uppercase<P>]: Foo[P]};
    //   ^? type Bar = { TEST: string; BUZZ: number; }
    type Baz = {[P in keyof Bar]: [Bar[P]]}; //=> type Baz = { TEST: [string]; BUZZ: [number]; }
  `);

  await page.getByText("number", { exact: true }).dblclick();
  await editor.pressSequentially("[");

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    type Foo = {test: string; buzz: [number]};
    //=> type Foo = { test: string; buzz: [number]; }
    type Bar = {[P in keyof Foo as Uppercase<P>]: Foo[P]};
    //   ^? type Bar = { TEST: string; BUZZ: [number]; }
    type Baz = {[P in keyof Bar]: [Bar[P]]}; //=> type Baz = { TEST: [string]; BUZZ: [[number]]; }
  `);
});

test("fill on load", async ({ page }) => {
  const code = dedent`
    const a = "bar";
    //    ^?
    type Foo = string; //=>
    type Bar = {bar: string}
    //=>
    type Baz = Foo | Array<Bar>; //=> type Baz = string | Bar[]
    let b = 50;
    //  ^?
    type Qux = string | number | bigint
    //=>
  `;
  await page.goto(generatePlaygroundLink(code));

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    const a = "bar";
    //    ^? const a: "bar"
    type Foo = string; //=> type Foo = string
    type Bar = {bar: string}
    //=> type Bar = { bar: string; }
    type Baz = Foo | Array<Bar>; //=> type Baz = string | Bar[]
    let b = 50;
    //  ^? let b: number
    type Qux = string | number | bigint
    //=> type Qux = string | number | bigint
  `);
});

test("on load, fill should not be debounced", async ({ page }) => {
  const code = dedent`
    let foo = "foo" //=>
  `;
  await page.goto(generatePlaygroundLink(code));

  await expect(page.locator(".lines-content .view-line")).toBeAttached(); // Let the editor load

  await expect(page.locator(".lines-content .view-line")).toHaveText(
    dedenter`
      let foo = "foo" //=> let foo: string
    `,
    { timeout: 400 },
  );
});

test("multiline option", async ({ page }) => {
  const code = dedent`
    type Foo = {fizz: string; buzz: number};
    //=>
    type Bar = {[P in keyof Foo as Uppercase<P>]: Foo[P]};
    //   ^?
    type Baz = {[P in keyof Bar]: [Bar[P]]}; //=>
  `;
  await page.goto(generatePlaygroundLink(code));

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    type Foo = {fizz: string; buzz: number};
    //=> type Foo = { fizz: string; buzz: number; }
    type Bar = {[P in keyof Foo as Uppercase<P>]: Foo[P]};
    //   ^? type Bar = { FIZZ: string; BUZZ: number; }
    type Baz = {[P in keyof Bar]: [Bar[P]]}; //=> type Baz = { FIZZ: [string]; BUZZ: [number]; }
  `);

  await page.getByRole("checkbox", { name: "Enable multiline comments" }).check();

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    type Foo = {fizz: string; buzz: number};
    //=> type Foo = {
    //       fizz: string;
    //       buzz: number;
    //   }
    type Bar = {[P in keyof Foo as Uppercase<P>]: Foo[P]};
    //   ^? type Bar = {
    //          FIZZ: string;
    //          BUZZ: number;
    //      }
    type Baz = {[P in keyof Bar]: [Bar[P]]}; //=> type Baz = {
                                             //       FIZZ: [string];
                                             //       BUZZ: [number];
                                             //   }
  `);
});

test("compact output option", async ({ page }) => {
  let code = dedent`
    // Function
    declare function someFunc(a: string): {b: string; c: number};
    someFunc('a');
    //=>

    // Variable
    const someConst = 'foo';
    //    ^?

    let someLet = {a: 1}; //=>

    var someVar = true;
    //=>

    // Type Alias
    type SomeType = {a: number};
    //   ^?

    // Generic Type Alias
    type SomeGenericType<T> = {a: T}; //=>
  `;

  await page.goto(generatePlaygroundLink(code));

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    // Function
    declare function someFunc(a: string): {b: string; c: number};
    someFunc('a');
    //=> function someFunc(a: string): { b: string; c: number; }

    // Variable
    const someConst = 'foo';
    //    ^? const someConst: "foo"

    let someLet = {a: 1}; //=> let someLet: { a: number; }

    var someVar = true;
    //=> var someVar: boolean

    // Type Alias
    type SomeType = {a: number};
    //   ^? type SomeType = { a: number; }

    // Generic Type Alias
    type SomeGenericType<T> = {a: T}; //=> type SomeGenericType<T> = { a: T; }
  `);

  await page.getByRole("checkbox", { name: "Compact output" }).check();

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    // Function
    declare function someFunc(a: string): {b: string; c: number};
    someFunc('a');
    //=> { b: string; c: number; }

    // Variable
    const someConst = 'foo';
    //    ^? "foo"

    let someLet = {a: 1}; //=> { a: number; }

    var someVar = true;
    //=> boolean

    // Type Alias
    type SomeType = {a: number};
    //   ^? { a: number; }

    // Generic Type Alias
    type SomeGenericType<T> = {a: T}; //=> { a: T; }
  `);

  // Next code
  code = dedent`
    // Interface
    interface SomeInterface { foo: string; }
    //        ^?

    // Generic interface
    interface SomeGenericInterface<T> { foo: T; }
    //=>

    // Parameter
    function someFuncWithParam(n: number) {
        n++; //=>
    }

    // Property
    const someObjectWithProp = {
        n: 1
        //=>
    };
  `;

  await page.goto(generatePlaygroundLink(code));

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    // Interface
    interface SomeInterface { foo: string; }
    //        ^? SomeInterface

    // Generic interface
    interface SomeGenericInterface<T> { foo: T; }
    //=> SomeGenericInterface<T>

    // Parameter
    function someFuncWithParam(n: number) {
        n++; //=> number
    }

    // Property
    const someObjectWithProp = {
        n: 1
        //=> number
    };
  `);

  await page.getByRole("checkbox", { name: "Compact output" }).uncheck();

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    // Interface
    interface SomeInterface { foo: string; }
    //        ^? interface SomeInterface

    // Generic interface
    interface SomeGenericInterface<T> { foo: T; }
    //=> interface SomeGenericInterface<T>

    // Parameter
    function someFuncWithParam(n: number) {
        n++; //=> (parameter) n: number
    }

    // Property
    const someObjectWithProp = {
        n: 1
        //=> (property) n: number
    };
  `);

  // Next code
  code = dedent`
    // Method
    const someObjectWithMethod = {
        n() { //=>
            return 1
        }
    };

    class SomeClassWithMethod {
        m() {
            return 'foo';
        }
    }
    const f = new SomeClassWithMethod()
        .m();
    //   ^?
  `;

  await page.goto(generatePlaygroundLink(code));

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    // Method
    const someObjectWithMethod = {
        n() { //=> (method) n(): number
            return 1
        }
    };

    class SomeClassWithMethod {
        m() {
            return 'foo';
        }
    }
    const f = new SomeClassWithMethod()
        .m();
    //   ^? (method) SomeClassWithMethod.m(): string
  `);

  await page.getByRole("checkbox", { name: "Compact output" }).check();

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    // Method
    const someObjectWithMethod = {
        n() { //=> number
            return 1
        }
    };

    class SomeClassWithMethod {
        m() {
            return 'foo';
        }
    }
    const f = new SomeClassWithMethod()
        .m();
    //   ^? string
  `);

  // Next code
  code = dedent`
    // Constructor
    class SomeClassWithConstructor {
        constructor() {
            //^?
            console.log('Foo');
        }
    }

    // Enum
    enum SomeEnum {} //=>

    // Const enum
    const enum SomeConstEnum { A = 1 } //=>

    // Enum Member
    enum SomeEnumWithMember { A }
    void SomeEnumWithMember
    .A;
    //=>
  `;

  await page.goto(generatePlaygroundLink(code));

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    // Constructor
    class SomeClassWithConstructor {
        constructor() {
            //^? SomeClassWithConstructor
            console.log('Foo');
        }
    }

    // Enum
    enum SomeEnum {} //=> SomeEnum

    // Const enum
    const enum SomeConstEnum { A = 1 } //=> SomeConstEnum

    // Enum Member
    enum SomeEnumWithMember { A }
    void SomeEnumWithMember
    .A;
    //=> 0
  `);

  await page.getByRole("checkbox", { name: "Compact output" }).uncheck();

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    // Constructor
    class SomeClassWithConstructor {
        constructor() {
            //^? constructor SomeClassWithConstructor(): SomeClassWithConstructor
            console.log('Foo');
        }
    }

    // Enum
    enum SomeEnum {} //=> enum SomeEnum

    // Const enum
    const enum SomeConstEnum { A = 1 } //=> const enum SomeConstEnum

    // Enum Member
    enum SomeEnumWithMember { A }
    void SomeEnumWithMember
    .A;
    //=> (enum member) SomeEnumWithMember.A = 0
  `);
});

test("pause on error option", async ({ page }) => {
  const code = dedent`
    type Foo = {fizz: string; buzz: number};
    //=> type Foo = { fizz: string; buzz: number; }
    type Bar = {[P in keyof Foo as Uppercase<P>]: Foo[P]};
    //   ^? type Bar = { FIZZ: string; BUZZ: number; }
    type Baz = {[P in keyof Bar]: [Bar[P]]}; //=> type Baz = { FIZZ: [string]; BUZZ: [number]; }
  `;
  await page.goto(generatePlaygroundLink(code));
  const editor = page.getByRole("textbox", { name: "Editor content" });

  await page.getByText("fizz:", { exact: true }).dblclick();
  await editor.press("ArrowLeft");
  await editor.press("Backspace");

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    type Foo = fizz: string; buzz: number};
    //=> type Foo = fizz
    type Bar = {[P in keyof Foo as Uppercase<P>]: Foo[P]};
    //   ^? type Bar = { [x: Uppercase<string>]: fizz; }
    type Baz = {[P in keyof Bar]: [Bar[P]]}; //=> type Baz = { [x: Uppercase<string>]: [fizz]; }
  `);

  await editor.pressSequentially("{");

  await page.getByRole("checkbox", { name: "Pause on error Pause comment" }).check();

  await page.getByText("fizz:", { exact: true }).dblclick();
  await editor.press("ArrowLeft");
  await editor.press("Backspace");

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    type Foo = fizz: string; buzz: number};
    //=> type Foo = { fizz: string; buzz: number; }
    type Bar = {[P in keyof Foo as Uppercase<P>]: Foo[P]};
    //   ^? type Bar = { FIZZ: string; BUZZ: number; }
    type Baz = {[P in keyof Bar]: [Bar[P]]}; //=> type Baz = { FIZZ: [string]; BUZZ: [number]; }
  `);
});

test("disable truncation option", async ({ page }) => {
  const code = dedent`
    type TupleOf<T, L extends number, Acc extends T[] = []> = L extends Acc["length"]
      ? Acc
      : TupleOf<T, L, [...Acc, T]>;

    type Foo = TupleOf<"foo", 15>; //=>
    type Bar = TupleOf<"bar", 15>;
    //   ^?
    type Qux = TupleOf<"qux", 15>;
    //=>
  `;
  await page.goto(generatePlaygroundLink(code));

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    type TupleOf<T, L extends number, Acc extends T[] = []> = L extends Acc["length"]
      ? Acc
      : TupleOf<T, L, [...Acc, T]>;

    type Foo = TupleOf<"foo", 15>; //=> type Foo = ["foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo…
    type Bar = TupleOf<"bar", 15>;
    //   ^? type Bar = ["bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar…
    type Qux = TupleOf<"qux", 15>;
    //=> type Qux = ["qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux…
  `);

  await page.getByRole("checkbox", { name: "Disable truncation Prevent" }).check();
  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    type TupleOf<T, L extends number, Acc extends T[] = []> = L extends Acc["length"]
      ? Acc
      : TupleOf<T, L, [...Acc, T]>;

    type Foo = TupleOf<"foo", 15>; //=> type Foo = ["foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo", "foo"]
    type Bar = TupleOf<"bar", 15>;
    //   ^? type Bar = ["bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar", "bar"]
    type Qux = TupleOf<"qux", 15>;
    //=> type Qux = ["qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux", "qux"]
  `);
});

test("on option toggle, fill should not be debounced", async ({ page }) => {
  const code = dedent`
    let foo = "foo" //=>
  `;
  await page.goto(generatePlaygroundLink(code));

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    let foo = "foo" //=> let foo: string
  `);

  await page.getByRole("checkbox", { name: "Compact output" }).check();

  await expect(page.locator(".lines-content .view-line")).toHaveText(
    dedenter`
      let foo = "foo" //=> string
    `,
    { timeout: 400 },
  );
});

test("only multiline comments should not be truncated", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("shareable-twoslash-comments/enable-multiline-comments", "true");
  });

  const code = dedent`
    const foobar1 = "foobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobar";
    //=>

    const foobar2 = {foobar: "foobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobar"} as const;
    //=>
  `;
  await page.goto(generatePlaygroundLink(code));

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    const foobar1 = "foobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobar";
    //=> const foobar1: "foobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobar…

    const foobar2 = {foobar: "foobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobar"} as const;
    //=> const foobar2: {
    //       readonly foobar: "foobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobarfoobar";
    //   }
  `);
});

test("correctly identify and replace query location change", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("shareable-twoslash-comments/enable-multiline-comments", "true");
  });

  const code = dedent`
    const [foo, bar] = [{a: "a"}, {b: {c: 1}}];
    //     ^? const foo: {
    //            a: string;
    //        }
    let baz = false;
  `;
  await page.goto(generatePlaygroundLink(code));
  const editor = page.getByRole("textbox", { name: "Editor content" });

  await page.getByText("const", { exact: true }).dblclick();
  await editor.press("ArrowDown");
  await editor.pressSequentially(" ".repeat(5));

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    const [foo, bar] = [{a: "a"}, {b: {c: 1}}];
    //          ^? const bar: {
    //                 b: {
    //                     c: number;
    //                 };
    //             }
    let baz = false;  
  `);

  await editor.press("Backspace");
  await editor.press("Backspace");
  await editor.press("Backspace");

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    const [foo, bar] = [{a: "a"}, {b: {c: 1}}];
    //     ^? const foo: {
    //            a: string;
    //        }
    let baz = false;
  `);
});

test("undo/redo behavior", async ({ page }) => {
  const code = dedent`
    const foo = "foo"
    //=> const foo: "foo"
  `;
  await page.goto(generatePlaygroundLink(code));
  const editor = page.getByRole("textbox", { name: "Editor content" });

  await editor.press("End");
  await editor.press("ArrowLeft");
  await editor.pressSequentially(" bar baz", { delay: 100 });

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    const foo = "foo bar baz"
    //=> const foo: "foo bar baz"
  `);

  await page.evaluate(undo);

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    const foo = "foo bar"
    //=> const foo: "foo bar"
  `);

  await page.evaluate(undo);

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    const foo = "foo"
    //=> const foo: "foo"
  `);

  await page.evaluate(redo);

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    const foo = "foo bar"
    //=> const foo: "foo bar"
  `);

  await page.evaluate(redo);

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    const foo = "foo bar baz"
    //=> const foo: "foo bar baz"
  `);

  await page.getByText("const", { exact: true }).dblclick();
  await editor.pressSequentially("let");

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    let foo = "foo bar baz"
    //=> let foo: string
  `);

  await page.evaluate(undo);

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    const foo = "foo bar baz"
    //=> const foo: "foo bar baz"
  `);

  await page.evaluate(redo);

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    let foo = "foo bar baz"
    //=> let foo: string
  `);
});

test("skip stale edits", async ({ page }) => {
  const code = dedent`
    type Foo = string;

    type Bar = string;
    //=> type Bar = string
  `;
  await page.goto(generatePlaygroundLink(code));
  const editor = page.getByRole("textbox", { name: "Editor content" });

  await page.evaluate(() => {
    (window as any).__shareableTwoslashComments_delayFunctionForTests = () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 2000);
      });
  });

  await page.getByText("type", { exact: true }).nth(1).dblclick();

  await editor.press("ArrowLeft");
  await editor.press("ArrowUp");
  await editor.press("Backspace", { delay: 600 }); // This is slightly more than the debounce delay for `fillTwoSlashQueries`
  await editor.press("Enter");

  await page.waitForEvent("console", {
    predicate: (msg) => msg.text() === "Skipping stale edits",
  });
});

test("undo should not leave behind orphan annotations", async ({ page }) => {
  const code = dedent`
    let foo = "foo";
  `;
  await page.goto(generatePlaygroundLink(code));
  const editor = page.getByRole("textbox", { name: "Editor content" });

  await editor.press("End");
  await editor.press("Enter");
  await editor.pressSequentially("//=>");

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    let foo = "foo";
    //=> let foo: string
  `);

  await page.evaluate(undo);
  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    let foo = "foo";
  `);
});

test("moving query around and undo/redo", async ({ page }) => {
  const code = dedent`
    let foobar = "1";
    const baz = 1;
    //    ^? const baz: 1
  `;
  await page.goto(generatePlaygroundLink(code));
  const editor = page.getByRole("textbox", { name: "Editor content" });

  await editor.press("PageDown");
  await editor.press("Alt+ArrowUp");

  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    let foobar = "1";
    //    ^? let foobar: string
    const baz = 1;
  `);

  await page.evaluate(undo);
  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    let foobar = "1";
    const baz = 1;
    //    ^? const baz: 1
  `);

  await page.evaluate(redo);
  await expect(page.locator(".lines-content .view-line")).toHaveText(dedenter`
    let foobar = "1";
    //    ^? let foobar: string
    const baz = 1;
  `);
});
