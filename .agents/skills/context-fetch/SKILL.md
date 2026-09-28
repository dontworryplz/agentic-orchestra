---
name: context-fetch
description: "Load this before opening any file. Use when you need to locate, understand, or modify code you have not already read — especially when a task names a symbol, function, module, route, or file you have not seen, when you are about to run a search, when you are tempted to open several files for context, or when you are unsure which file actually holds the behaviour."
---

# Context Fetch

Control how much source enters the context window. Context is the scarce resource, not time. An
agent that opens five files hunting one function spends more budget than the entire rest of the task.
Every read is a permanent, non-recoverable cost. Search is cheap and re-runnable; a read is not.

If a code-graph surface is available (see `skill://graft`, `skill://codebase-memory`), a single graph
query can replace steps 2-3.

## Ordering principle

Always resolve the cheapest sufficient surface first, and widen only when the cheaper one provably
failed. Never widen on suspicion.

| Order | Surface | Typical cost | Answers | Stop when |
| --- | --- | --- | --- | --- |
| 1 | Name / symbol lookup (grep, index, LSP) | trivial | Does it exist, where | One candidate path remains |
| 2 | Structural view (outline, symbol list, skeleton, decls) | cheap | How is it shaped | Target member is located |
| 3 | Call-graph / reference edges | cheap | Who calls it, what it calls | Flow is clear enough to reason |
| 4 | Targeted read (known line span) | moderate | The exact behaviour | Behaviour is understood |
| 5 | Full file read | expensive | Everything, including noise | Task complete, or stalled |

Steps 1-3 are re-runnable at no lasting cost. Only step 4 and 5 consume durable context, so a correct
step 4 must never be upgraded to step 5 out of curiosity.

## Procedure

1. **State the question.** Write one line naming the exact fact you need: which function, which
   caller, which value, which registration. If the line cannot be written, the task is not scoped
   yet — clarify before fetching.
2. **Read nothing yet.** Confirm the "read nothing yet" gate before the first `read` call: a name or
   path lookup has already been issued, and you know the specific span or symbol you intend to read.
   Opening a file because it seems relevant fails this gate.
3. **Narrow the scope.** Pass an explicit path or subtree filter to every search (`--in <path>`, an
   include glob, a directory argument, a file pattern). One known subtree beats the whole tree. Never
   search repo-wide when a plausible subtree exists.
4. **Look up by name.** Search for the symbol, not for a concept paragraph. Prefer identifier-shaped
   queries: declaration sites, call sites, import sites, string literals. Note the count of hits.
5. **Disambiguate before reading.** If the name matches more than one site, decide which site the task
   means using call sites, imports, module path, and naming convention. State the decision in one
   sentence. Read only the winner. Do not read a candidate in order to find out which one it is.
6. **Get the shape.** If the target is a large unit, take an outline or symbol listing first, then
   select the member or span. Skipping this step is the most common budget leak.
7. **Trace edges once.** Pull caller/callee edges for the target only. If the flow is already
   unambiguous, stop here and skip to step 9.
8. **Read the span.** Open the narrowest range that answers the question. A full file is justified only
   when the file is small, or when the answer genuinely depends on the whole unit.
9. **Close the loop.** Re-run the narrowing if the read did not resolve the fact. Do not re-read a
   file already read this task; re-search it instead. Record the file and line as the citation.
10. **Stop, or report.** If the fact is still unresolved after one widening step, stop and report the
    dead end with what was searched and what was ruled out.

## Budget rule

- Cheap surfaces failed once, then widen exactly one level. Do not jump levels.
- After step 5, at most a small constant number of files (roughly three) should be open at once. If
  more are open, the disambiguation step was skipped.
- If widening twice in a row produces no new candidate, the premise is wrong. Stop and report.
- A dead end is a result. Report it: what you searched, scope used, candidates ruled out, and what
  would resolve it. Do not compensate by widening scope or opening files "for context".
- When a task genuinely needs the whole repository, say so explicitly, then use the cheapest wide
  surface available rather than reading files one by one.

## Rejected anti-patterns

| Anti-pattern | Why rejected |
| --- | --- |
| Opening files "to get context" | Feels productive, decides nothing. Puts durable cost ahead of a fact you have not formulated. |
| Reading a file because a plan mentioned it | Plans name intent, not location. Reads a guess and cements it. |
| Re-reading a file already read this task | Content is already in context. Re-read a span if needed; re-read the whole file is pure waste. |
| Widening scope after a dead end instead of reporting | Tradeoff failure: converts a cheap, honest "not found" into an unbounded spend that also hides the failure. |
| Treating grep hits as understanding | Hits give locations, not control flow, invariants, or error paths. A hit is a pointer to a read, not a substitute for it. |
| Opening a generated or vendor directory | Machine output, near-zero signal density, enormous token mass. Exclude it from search scope. |
| Reading every candidate to disambiguate | Turns a naming decision into a reading budget. Disambiguate from edges and paths first. |
| Reading a whole file when a span answers it | Unbounded cost for a bounded question. |
| Searching repo-wide when a subtree is known | More hits, more noise, no more signal. |
| Continuing past an unresolved fact without saying so | Silent fabrication risk: the agent proceeds on a guess it never disclosed. |

## Output contract

Before reporting completion of any step 1-8 pass, the agent must be able to state, in this order:

1. **Question** — the single fact being sought.
2. **Scope** — the subtree or path filter used, and what was excluded.
3. **Resolution** — the chosen site, with the evidence that disqualified the others when more than one
   matched.
4. **Reads** — the files and line spans actually opened, once each.
5. **Stop** — why widening stopped: resolved, budget reached, or dead end.

If any line cannot be filled, the fetch is not finished: either narrow it, or report the gap instead of
implying the source was understood.

## Hand off

A fetch is preparation, not the task. When the fact is in hand, route it:

| You now need to | Go to |
|---|---|
| Change the structure without breaking callers | `skill://refactor-safely` |
| Find the observable seam a spec clause must be checked at | `skill://verifier` |
| Diagnose a failure you can now reproduce | `skill://debug-issue` |
| Prove a change works, not just that it reads right | `skill://empirical-validation` |

A dead end is a result. Report it rather than routing it into a wider search.
