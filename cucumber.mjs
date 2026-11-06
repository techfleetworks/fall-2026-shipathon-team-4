// Cucumber.js runs the Gherkin scenarios in features/ as executable tests.
// Strict mode (the default) fails on any undefined or pending step.
export default {
  paths: ["features/**/*.feature"],
  // TypeScript step definitions are compiled on the fly by tsx (CommonJS hook).
  requireModule: ["tsx/cjs"],
  require: ["features/step_definitions/**/*.ts"],
  strict: true,
  format: ["progress", "json:reports/cucumber.json"],
};
