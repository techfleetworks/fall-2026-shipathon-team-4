/** Guardrails & disclaimers (ticket B1). See docs/adr/ADR-004-guardrails.md. */
export { GUARDRAIL_RULES, CRISIS_SENTINEL, type GuardrailRule, type GuardrailRuleId } from './rules.js';
export { buildSystemPrompt, type SystemPromptOptions } from './systemPrompt.js';
export { checkOutput, type CheckContext, type CheckResult, type Violation } from './checks.js';
export { guardResponse, type GuardResult } from './enforce.js';
export {
  DISCLAIMERS,
  BLOCKED_FALLBACK,
  CRISIS_MESSAGE,
  CRISIS_RESOURCES,
  CRISIS_SHORT,
  crisisMessageText,
  disclaimerText,
  withAppName,
  type CrisisResource,
  type DisclaimerKey,
} from './copy.js';
