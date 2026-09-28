---
name: calibrated-judgment
description: >
  Ask a bounded typed question (choice, score, or yes-probability) to a
  calibrated judgment model instead of answering from vibe. Trigger when the
  task needs: "which option is best", "score these items", "is this a real
  finding", "rank these candidates", "triage this list", or any decision with
  a closed set of answers where a probability is more useful than prose.
  Backends: Laya (MCP tools where the harness provides them), Jev (CLI/API
  where a key is configured). Falls back to a stated-uncertainty self-judge
  when neither backend is reachable.
---

# Calibrated Judgment

## Purpose

Some decisions are neither search problems nor writing problems — they are
judgments over a closed set: pick one of N options, score an item 0–5, or
state the probability that a claim holds. A general model answering those in
prose returns a vibe with no uncertainty attached. A calibrated judgment
model (Laya, Jev) returns a typed answer with a probability, in ~250 ms, for
a fraction of a cent, without loading the judged items into context.

Use this skill whenever the output must be something code or a gate can
switch on: triage labels, severity scores, routing choices, finding validity.

## Scope

This skill covers two backends for the same question shape:

| Backend | Reach it through | Needs | Cost model |
|---|---|---|---|
| **Laya** | MCP tools (`laya_predict`, `laya_decide`, `laya_shortlist`, presets) where the harness exposes them | a harness with the Laya MCP server | local checkpoint, no key |
| **Jev** | CLI / API (`jev ask`, Agent Skill `jev-ai/jev-agent-skill`) | `JEV_API_KEY` (or `TYPESAFE_API_KEY`) in the environment | ~250 ms, fraction of a cent per call |

Neither backend generates text, runs commands, or approves actions. They
judge; the host agent, its permissions, and human approvals still control
what happens next.

## Procedure

### Step 1: Frame the question as typed

Rewrite the decision into one of three shapes before calling anything:

- **choice**: `options` is a closed list (≤20 labels; more needs shortlisting
  first). One winner, with per-option probabilities.
- **score**: an ordinal rubric with integer minimum/maximum (e.g. severity
  0–4). The rubric text is part of the call — an unscored number is a vibe.
- **noul** (yes-probability): a single falsifiable proposition plus what
  counts as true. Returns P(true).

Strip the state to the smallest useful context: the item, the options, the
rubric. Never paste hundreds of items "so the judge can see them all" — that
is exactly the context burn this skill exists to prevent. For bulk triage,
call once per item (batch mode) rather than once with a wall of text.

### Step 2: Pick the backend

1. If the harness exposes Laya MCP tools, use Laya. One forward pass,
   no key, structured answers with confidence and routing metadata.
2. Else if a Jev key is configured, use Jev. Stateless CLI, stable JSON on
   stdout, exit codes you can branch on (2 usage, 3 auth, 4 api, 5 network).
3. Else do not call anything. Fall back to a self-judge: state the verdict
   with explicit uncertainty (`UNCERTAIN — no calibrated backend reachable`)
   and route it as `NEEDS CONTEXT`, never as `CONFIRMED`.

A missing backend is a degraded mode, not an error to route around by
inventing probabilities.

### Step 3: Call it

**Laya** (single question):

```
laya_predict(state={...}, questions={severity: {type: score, instructions, criteria}})
laya_decide(schema={severity: {minimum, maximum}}, state={...})   # values projected onto the schema
```

Many items: `laya_predict_batch(requests=[...])` shares forward passes when
schemas match — one round trip instead of N. Many options: `laya_shortlist`
narrows to the k most likely labels first. Known workflow shapes
(email, guard, moderation, triage, router): `laya_preset` instead of
hand-written questions.

**Jev** (stateless shell primitive):

```bash
jev ask --question questions.json --state state.json   # JSON on stdout, diagnostics on stderr
```

Branch on the exit code before parsing the answer. Record usage where the
backend reports it; stop and report on auth/usage errors rather than
retrying in a loop.

### Step 4: Interpret the answer

- Read the probability, not just the label. A 0.52 winner is a coin flip
  wearing a decision — report it as `LIKELY` at best, or abstain.
- Suggested thresholds: act on `CONFIRMED` only at p ≥ 0.8 with a falsifiable
  proposition; `0.5–0.8` is `LIKELY` and must carry its uncertainty into the
  report; below 0.5 is `ABSTAINED`, not a negative finding.
- Never average probabilities across different questions or backends into a
  single number. One question, one verdict, one backend named.

### Step 5: Report the verdict

Every callsite returns one line per question:

```
JUDGE <question-name>: DECIDED <label> p=<0–1> via <laya|jev|self>
JUDGE <question-name>: ABSTAINED <reason> via <laya|jev|self>
```

`DECIDED` requires a named backend and a probability. `ABSTAINED` requires a
reason (no backend, under-threshold, malformed state). There is no third
form and no bare label without a probability.

## Output contract

1. `BACKEND` — `laya`, `jev`, or `self`, plus why (tools present, key
   present, or neither reachable).
2. One `JUDGE` line per question: `DECIDED <label> p=<n>` or
   `ABSTAINED <reason>`.
3. `UNCERTAINTY` — the probabilities that rode along, stated numerically.
   A verdict reported without its probability is a vibe and must be
   re-graded as `ABSTAINED`.
4. `AUTHORITY` — what the verdict does NOT permit: no execution, no payment,
   no deletion, no approval bypass. The verdict informs a gate; it is not
   the gate.

## Rejected anti-patterns

| Anti-pattern | Why it is rejected |
|---|---|
| Answering a closed question in prose | Prose has no probability; a gate cannot switch on it |
| Pasting the whole backlog into one call | Burns the context this skill exists to save; batch per item instead |
| Inventing a probability when no backend is reachable | An invented number is worse than an abstention — it launders a guess as measurement |
| Averaging scores across different questions | Different questions have different scales; the mean is meaningless |
| Treating the verdict as approval | The judge classifies; permissions and humans approve |
| Retrying auth/usage failures in a loop | Spends quota to re-prove a missing key; stop and report |

## Orchestra binding

This skill is a first-party procedure. Its heaviest consumer is the Judge
step of `skill://security-review`: where a finding's validity is a genuinely
bounded question (severity score, reachable-or-not proposition), the
`security-reviewer` may call this skill for a calibrated number — and must
still cite the file:line evidence itself, because a probability is not a
trace. `skill://sol-luna-orchestrator` owns the routing decision (triage,
severity, routing choices); this skill owns the measurement.

## Hand off

| You need to | Go to |
|---|---|
| Prove a verdict against reality, not just a probability | `skill://empirical-validation` — a 0.9 that fails the falsification test was a miscalibration, report it as such |
| Investigate why a backend errors before retrying | `skill://debug-issue` — especially auth, quota, and schema-shape failures |
| Route the verdict into a plan or a gate | `skill://sol-luna-orchestrator` — the verdict informs the decision, the conductor makes it |
| Score a vulnerability finding or its severity | `skill://security-review` — the Judge step defines what CONFIRMED and LIKELY require beyond the number |
| Check a decision against a spec clause | `skill://verifier` — a verdict that contradicts a requirement is wrong no matter its probability |
