import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 測試用的編譯產物（tsconfig.test.json 的 outDir）——是 CommonJS，
    // 會被 no-require-imports 之類的規則誤判。
    ".test-build/**",
  ]),
]);

export default eslintConfig;
