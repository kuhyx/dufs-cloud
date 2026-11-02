import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

// Aggressive, type-aware config: everything typescript-eslint's strict +
// stylistic *type-checked* presets flag is an error. Unused disable
// directives are themselves errors, so every `eslint-disable` must be
// load-bearing. The type-checked presets are scoped to .ts files; .astro files
// get eslint-plugin-astro's recommended set (their frontmatter and scripts are
// also covered by `astro check`).
export default tseslint.config(
  { ignores: ["dist", "coverage", "legacy-react", ".astro", "src/env.d.ts"] },
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  js.configs.recommended,
  ...[
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
  ].map((c) => ({ ...c, files: ["**/*.ts"] })),
  ...astro.configs["flat/recommended"],
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      // Declaration merging is spelled as an empty interface with one
      // `extends` (src/test/jest-dom.d.ts augments vitest's Assertion); the
      // rule's own option exists for exactly that shape.
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends" },
      ],
    },
  },
  {
    // Asserting on a vitest mock method (e.g. `expect(client.remove)`) trips
    // unbound-method even though the reference is safe; disable it in tests.
    files: ["**/*.test.ts", "src/test/**"],
    rules: { "@typescript-eslint/unbound-method": "off" },
  },
  {
    files: ["*.js", "*.mjs", "*.cjs"],
    ...tseslint.configs.disableTypeChecked,
  },
);
