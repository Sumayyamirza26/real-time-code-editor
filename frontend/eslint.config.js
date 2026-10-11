import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: ["build", "node_modules"] },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
  },
  js.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
];
