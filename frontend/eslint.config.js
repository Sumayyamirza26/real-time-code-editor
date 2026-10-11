import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: ["build", "node_modules"] },
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
  },
  { ...js.configs.recommended, files: ["**/*.js", "**/*.jsx"] },
  {
    files: ["**/*.js", "**/*.jsx"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
];
