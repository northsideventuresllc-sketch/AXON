import coreWebVitals from "eslint-config-next/core-web-vitals";

// Flat-config equivalent of the old .eslintrc.portal-parity.json
// ({ "root": true, "extends": "next/core-web-vitals" }), scoped to
// components/axon by the `lint:portal-parity` script's file glob.
// Migrated for eslint 9 (ESLint 9's default flat-config loader can no
// longer load a bare .eslintrc.json via --config without an explicit
// `type: json` import attribute).
const reactHooksPlugin = coreWebVitals.find((c) => c.plugins?.["react-hooks"])
  ?.plugins?.["react-hooks"];

const eslintConfig = [
  ...coreWebVitals,
  {
    // eslint-config-next 16 ships eslint-plugin-react-hooks v6, which adds new
    // rules (set-state-in-effect, refs, immutability, preserve-manual-memoization)
    // that flag pre-existing patterns unrelated to this Next 15->16 security
    // upgrade. Downgraded to warn here so the security PR stays mechanical;
    // fixing these behaviorally is separate work (same rationale as
    // northside-intelligence#292 and the sibling northsideventuresgroup PR).
    plugins: { "react-hooks": reactHooksPlugin },
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];

export default eslintConfig;
