import path from "node:path";
import { fileURLToPath } from "node:url";

import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import _import from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
});

export default [
  {
    ignores: ["**/node_modules"]
  },
  ...tseslint.configs.recommended,
  ...fixupConfigRules(
    compat.extends(
      "eslint:recommended",
      "plugin:import/recommended",
      "plugin:import/errors",
      "plugin:import/warnings",
      "plugin:import/typescript"
    )
  ),
  eslintConfigPrettier,
  {
    plugins: {
      import: fixupPluginRules(_import),
      "unused-imports": unusedImports
    },

    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser
      },

      ecmaVersion: "latest",
      sourceType: "module",

      parserOptions: {
        project: "./tsconfig.json"
      }
    },

    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"]
      },

      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "."
        }
      }
    },

    rules: {
      indent: ["error", 2],
      "linebreak-style": ["error", "unix"],
      semi: ["error", "always"],
      "no-path-concat": 0,
      "no-unused-vars": 0,
      "eol-last": ["warn", "always"],
      "import/no-unresolved": "warn",

      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "parent", "sibling", "index", "object", "type"],
          pathGroupsExcludedImportTypes: ["builtin"],

          alphabetize: {
            order: "asc"
          },

          "newlines-between": "always"
        }
      ],

      "no-param-reassign": "warn",
      "no-var": "warn",
      "no-eq-null": "error",
      "no-mixed-spaces-and-tabs": ["error"],
      "unused-imports/no-unused-imports": "warn",

      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports"
        }
      ],

      "@typescript-eslint/indent": "off",
      "@typescript-eslint/no-unused-vars": ["warn"],
      //   "@typescript-eslint/semi": ["warn", "always"],

      "@typescript-eslint/no-floating-promises": [
        "warn",
        {
          ignoreIIFE: true
        }
      ],

      "@typescript-eslint/no-namespace": "warn"
    }
  }
];
