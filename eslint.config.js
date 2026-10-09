import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.wrangler/**", "**/playwright-report/**", "**/test-results/**", "video/out/**", ".claude/**"] },
  ...tseslint.configs.recommended,
);
