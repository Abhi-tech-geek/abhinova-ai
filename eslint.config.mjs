// ESLint 9 flat config (Next 16 removed `next lint` and .eslintrc support).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // New React Compiler advisories (eslint-plugin-react-hooks v7) flag
    // patterns that predate them and work fine (mount flags, browser-API
    // detection). Warn for now; tighten when those components are refactored.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "design-reference/**", "private-learning/**"],
  },
];

export default config;
