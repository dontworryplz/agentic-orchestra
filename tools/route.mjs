// Routing suggestions for skill://sol-luna-orchestrator.
//
// The skill's task-to-agent table is prose that a conductor must interpret.
// That interpretation is where delegation goes wrong: a question that fits one
// explorer gets a coordinator, a slice that fits Luna gets Space Bunny. This
// tool suggests a routing from the description of the work, with the reason
// attached — and refuses the cases the table refuses.
//
//   node tools/route.mjs "map the auth flow in handlers/"
//   node tools/route.mjs "implement the pagination fix in two files" --json
//   node tools/route.mjs --agents   # what this version knows how to route to
//
// This is a suggestion, not an assignment. The conductor still decides. What it
// removes is the most common mistake: choosing by availability (the role exists)
// rather than by capability (the role fits the shape of this task).

import process from 'node:process';

// Each pattern is (description-regex, verdict, reason). Order matters: specific
// shapes first, the catch-alls last. The rules that resolve a question in one
// pass come before the ones that fan out, because fan-out is what must be
// justified.
const RULES = [
  {
    re: /secur|auth|tenant|permission|vuln|secret|bypass|inject|ssrf|xss|sqli|idor/i,
    route: 'spawning: none — route to luna-reviewer with skill://review-changes',
    reason: 'security-sensitive scope needs one independent gate, not a tree',
  },
  {
    re: /two|three|several|multiple|across .* and|both|combine|integrat|shared interface|contract/i,
    route: 'luna-integrator',
    reason: 'two or more slices that share an interface need a seam owner',
  },
  {
    re: /large|wide|whole (repo|codebase)|unfamiliar|architecture|map the|all callers|blast radius/i,
    route: 'luna-coordinator',
    reason: 'too wide for one explorer pass, but no code is written',
  },
  {
    re: /implement|fix|build|add|write|refactor|rename|move|migrate|patch|slice/i,
    route: 'luna-worker',
    reason: 'one bounded slice; add space-bunny-worker only when the read set exceeds 272K',
  },
  {
    re: /review|audit|check|correctness|regress|gate|merge|pr\b|diff/i,
    route: 'luna-reviewer',
    reason: 'independent gate over an existing change; never a child that wrote the code',
  },
  {
    re: /test|verify|repro|prove|smoke|failing/i,
    route: 'luna-tester',
    reason: 'proof of behavior, not of code',
  },
  {
    re: /research|version|latest|docs? for|api behav|compatib|upgrade|deprecat/i,
    route: 'luna-researcher',
    reason: 'version facts live outside the repository',
  },
  {
    re: /explore|find|locate|where|trace|flow|callers|symbols?|structure/i,
    route: 'luna-explorer',
    reason: 'read-only location and flow questions are one-explorer work',
  },
];

const KNOWN = [
  'luna-coordinator', 'luna-integrator', 'luna-tester', 'luna-worker', 'luna-reviewer',
  'luna-explorer', 'luna-researcher', 'space-bunny-worker', 'space-bunny-reviewer',
  'antigravity-gemini-explorer', 'antigravity-sonnet-worker', 'antigravity-opus-reviewer',
];

function route(description) {
  for (const rule of RULES) {
    if (rule.re.test(description)) {
      return { task: description, route: rule.route, reason: rule.reason };
    }
  }
  return {
    task: description,
    route: 'undecided — state the shape before choosing a role',
    reason: 'no rule matched, so nothing may be assumed; partition by area, name the evidence, then pick',
  };
}

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  process.stdout.write(
    'usage: node tools/route.mjs "<task description>" [--json]\n' +
    '       node tools/route.mjs --agents\n'
  );
  process.exit(0);
}
if (args.includes('--agents')) {
  process.stdout.write(`${KNOWN.join('\n')}\n`);
  process.exit(0);
}

const asJson = args.includes('--json');
const description = args.filter((a) => !a.startsWith('--')).join(' ');
if (!description) {
  process.stderr.write('error: describe the work, e.g. node tools/route.mjs "review the staged diff"\n');
  process.exit(2);
}

const result = route(description);
if (asJson) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`route:  ${result.route}\nreason: ${result.reason}\n`);
}
