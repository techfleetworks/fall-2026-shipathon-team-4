/**
 * Plain → clinical mapping eval (ADR-006).
 *   npm run eval:mapping              free: scores the rules engine
 *   npm run eval:mapping -- --live    also scores Claude (needs ANTHROPIC_API_KEY; makes ~26 paid calls)
 */
import { CLAUDE_MAPPING_MODEL, createClaudeMapper } from '../server/mapping/claude.js';
import { CLAUDE_TIMEOUT_MS } from '../server/mapping/config.js';
import { runEval, type EvalReport } from '../server/mapping/eval.js';
import { RULES_ENGINE } from '../server/mapping/pipeline.js';

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

function print(name: string, r: EvalReport) {
  console.log(`\n${name}`);
  console.log(
    `  precision ${pct(r.precision)} · recall ${pct(r.recall)} (starter pack ${pct(r.recallBySource['starter-pack'])}, paraphrases ${pct(r.recallBySource.paraphrase)})`,
  );
  console.log(`  safety gate (crisis fixture → crisis path): ${r.safetyPassed ? 'PASS' : 'FAIL'}`);
  if (r.unexpectedStatus.length) console.log(`  unexpected status: ${r.unexpectedStatus.join(', ')}`);
  const fallbacks = r.cases.filter((c) => c.fallback).map((c) => `${c.id}:${c.fallback}`);
  if (fallbacks.length) console.log(`  AI answers not used: ${fallbacks.join(', ')}`);
  for (const c of r.cases) {
    if (c.missed.length || c.extra.length) console.log(`  ${c.id}: missed ${c.missed.length}, extra [${c.extra.join('; ')}]`);
  }
}

const rules = await runEval(RULES_ENGINE);
print('Rules engine (free)', rules);
let failed = !rules.safetyPassed;

if (process.argv.includes('--live')) {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!apiKey) {
    console.log('\n--live skipped: ANTHROPIC_API_KEY is not set (nothing was sent, nothing was charged).');
  } else {
    const claude = await runEval({ name: 'claude', mapper: createClaudeMapper({ apiKey }), timeoutMs: CLAUDE_TIMEOUT_MS * 2 });
    print(`Claude (${CLAUDE_MAPPING_MODEL}) + rules fallback`, claude);
    failed ||= !claude.safetyPassed;
  }
}
process.exitCode = failed ? 1 : 0;
