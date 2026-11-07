// Cucumber.js runs the Gherkin scenarios in features/ as executable tests (strict: undefined steps fail).
// Run through `npm run test:bdd`, which loads tsx so the TypeScript step definitions work.
export default {
  paths: ['features/**/*.feature'],
  import: ['features/step_definitions/**/*.ts'],
  strict: true,
  format: ['progress'],
};
