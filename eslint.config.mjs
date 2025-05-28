import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import functional from "eslint-plugin-functional";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules"]
  },

  js.configs.recommended,

  // 共通プラグイン
  {
    plugins: {
      "unused-imports": unusedImports,
      functional
    }
  },

  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  functional.configs.lite,

  // 型依存ルールをJSで一括無効化
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    ...functional.configs.disableTypeChecked
  },

  tseslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"] // Ensure it only applies to TS files
  })),

  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
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
      "no-path-concat": "off",
      "no-unused-vars": "warn",
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
      "functional/no-let": [
        "off",
        {
          allowInForLoopInit: true,
          allowInFunctions: false
        }
      ],
      "functional/immutable-data": ["warn", { ignoreImmediateMutation: true, ignoreMapsAndSets: true }],
      "functional/no-throw-statements": ["warn", { allowToRejectPromises: true }],
      "functional/no-class-inheritance": ["warn", { ignoreIdentifierPattern: "Error" }],
      "functional/no-loop-statements": "off",
      "functional/no-conditional-statements": "off",
      "functional/no-expression-statements": "off",
      "functional/no-return-void": "off"
    }
  },

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        // プロジェクトのtsconfig.jsonを指定
        project: ["./bookmeter-refactored/tsconfig.json", "./tsconfig.json"],
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
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
      "import/namespace": "off",
      "import/named": "off",
      "import/default": "off",
      "import/no-named-as-default-member": "off"
    }
  },

  eslintConfigPrettier
);
