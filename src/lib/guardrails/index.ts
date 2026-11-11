/** Guardrails & disclaimers (ticket B1). See docs/adr/ADR-004-guardrails.md. */
export { GUARDRAIL_RULES, CRISIS_SENTINEL, type GuardrailRule, type GuardrailRuleId } from './rules.js';
export { buildSystemPrompt, type SystemPromptOptions } from './systemPrompt.js';
export { checkOutput, type CheckContext, type CheckResult, type Violation } from './checks.js';
export { guardResponse, storyDraftHasCrisis, type GuardResult } from './enforce.js';
export {
  DISCLAIMERS,
  BLOCKED_FALLBACK,
  CRISIS_DETECTED_RESOURCES,
  CRISIS_HANDOFF,
  HELP_HEADING,
  HELP_PAGE_FOOTER,
  HELP_PAGE_FOOTER_LINE,
  HELP_RESOURCES,
  crisisMessageText,
  disclaimerText,
  withAppName,
  type DisclaimerKey,
  type HelpAction,
  type HelpResource,
  type HelpResourceId,
} from './copy.js';
