// ESLint flat config: TypeScript recommended rules plus the React hooks rules.
// The hooks rules matter most here — GameScreen relies heavily on ref/effect
// discipline, and exhaustive-deps flags any accidental stale-closure bugs.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "dev-dist"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  }
);
