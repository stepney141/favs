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

  // 共通プラグインをここで一括宣言
  {
    plugins: {
      import: fixupPluginRules(_import),
      "unused-imports": unusedImports,
      functional: functionalPlugin
    }
  },

  ...fixupConfigRules(
    compat.extends(
      "plugin:import/recommended",
      "plugin:import/errors",
      "plugin:import/warnings",
      "plugin:import/typescript"
    )
  ),

  // JS/TS 共通の非スタイル系ルール
  {
    files: ["**/*.{js,ts,tsx,mjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser
      },
      ecmaVersion: "latest",
      sourceType: "module"
    },
    settings: {
      "import/resolver": {
        typescript: {
          // プロジェクトのtsconfig.jsonを指定
          project: ["./**/tsconfig.json", "./tsconfig.json"],
          alwaysTryTypes: true
        }
      }
    },
    rules: {
      indent: "off",
      "linebreak-style": "off",
      semi: "off",
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
      "unused-imports/no-unused-imports": "warn"
    }
  },

  // Typed Lint
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"] // Ensure it only applies to TS files
  })),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        // プロジェクトのtsconfig.jsonを指定
        project: ["./**/tsconfig.json", "./tsconfig.json"],
        projectService: true,
        tsconfigRootDir: import.meta.dirname
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
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports"
        }
      ],
      "@typescript-eslint/indent": "off",
      "functional/no-let": "warn",
      "functional/immutable-data": "warn",
      "functional/no-conditional-statements": "off",
      "functional/no-expression-statements": "off",
      "functional/no-return-void": "off"
    }
  },

  eslintConfigPrettier
];
