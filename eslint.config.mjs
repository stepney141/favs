import path from "node:path";
import { fileURLToPath } from "node:url";

import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import functionalPlugin from "eslint-plugin-functional";
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
  // Apply general rules (excluding typed rules) to all files first
  {
    files: ["**/*.ts", "**/*.js", "**/*.mjs"], // Include .mjs for config file
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
      sourceType: "module"
    },
    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"]
      },
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true
          // project setting removed from here
        }
      }
    },
    rules: {
      // General rules (not requiring type info)
      indent: ["error", 2],
      "linebreak-style": ["error", "unix"],
      semi: ["error", "always"],
      "no-path-concat": 0,
      "no-unused-vars": 0, // Use @typescript-eslint/no-unused-vars instead for TS files
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
      "no-param-reassign": "error",
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
      "@typescript-eslint/indent": "off" // Often handled by Prettier
      // Functional rules moved to TS-specific block
    }
  },
  // Apply recommended typed rules and functional rules to TS files
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"] // Ensure it only applies to TS files
  })),
  // Add specific overrides for TS files in a separate object
  {
    files: ["**/*.ts"],
    plugins: {
      // Add functional plugin here
      functional: functionalPlugin
    },
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json"
      }
    },
    rules: {
      // Specific overrides and functional rules
      "@typescript-eslint/no-unused-vars": ["error"],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          ignoreIIFE: true
        }
      ],
      "@typescript-eslint/no-namespace": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn", // Disable unsafe assignment rule
      // Disable base 'no-unused-vars' to avoid conflict with TS version
      "no-unused-vars": "off",
      // Functional rules (warn level) - moved here
      "functional/no-let": "warn",
      "functional/immutable-data": "warn",
      "functional/no-conditional-statements": "off",
      "functional/no-expression-statements": "off",
      "functional/no-return-void": "off"
    }
  },
  eslintConfigPrettier
];
