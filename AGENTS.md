# AGENTS.md

Read this before changing the repo. The repo is the **source copy** of the OMP
agent/skill files; `~/.omp/agent/agents` and `~/.omp/skills` are the
distribution targets.

## Invariants

1. **Do not change model pins without evidence.** The `model:` lines and
   `config.yml` `task.agentModelOverrides` can contradict each other. Verify
   which one is in force with `omp models` and a real `task` result; if the
   two differ, document both.
2. **No routing to a nonexistent skill.** Every `skill://<name>` in an agent
   body must either exist as `skills/<name>/SKILL.md` or be deliberately
   removed. `docs/skills-reference.md` is the current map of that gap — update
   it when you add a skill or drop a reference.
3. **Language split.** `agents/*.md` and `skills/*/SKILL.md` stay **English**
   (they are runtime prompts, models read them). `README.md` and `docs/` are
   Turkish.
4. **Read-only roles stay small.** Do not add write capability to the body of
   an agent that contains no `edit`/`write`.
5. **No agent calls `stage`/`commit`.** This rule is part of the agent body
   contract; do not relax it.
6. **Change both converters together.** `install-opencode.sh` /
   `install-claude.sh` and `lib/convert.mjs` apply the same mappings. Changing
   one side turns `verify.sh` check 12 red — on purpose. If you see red, either
   fix the other side or relax the check; if you really want to split the
   mapping on purpose, write the rationale.
7. **Preserve the `skills/` convention.** `npx skills add` reads no
   configuration, it reads the directory layout. Do not break the
   `skills/<name>/SKILL.md` layout; `verify.sh` check 13 asserts it.
8. **Do not orphan the procedure graph.** Every skill must have a
   `## Hand off` section and every skill must be addressed by at least one
   other skill via `skill://`. Nine independent documents are nine separate
   procedures; an agent invents its own way. When adding a skill, link it to an
   existing skill, or link an existing skill to the new one. Check 15 forces
   both. If removing a skill orphans it, update the `skill://` lines that
   address it.
9. **`bin/` entry points must be executable.** Without a shebang and the exec
   bit, `npx` silently falls through to the shell and gives a confusing error
   like "import: command not found". This happened once.

## Layout

```
agents/     one agent = one file, file name = frontmatter `name`
skills/     one skill = one directory, SKILL.md frontmatter `name` = directory name
docs/       facts specific to this repo, not a general agent guide
```

If an agent file is renamed, the `docs/architecture.md` table and the routing
table in `skills/sol-luna-orchestrator/SKILL.md` are updated.

## Verification

Run after a change:

```bash
# her şeyi tek komutta doğrula (bash tarafı, 14 kontrol)
./verify.sh

# frontmatter ayrıştırma + skills referans bütünlüğü
for f in agents/*.md skills/*/SKILL.md; do
  head -1 "$f" | grep -q '^---$' || echo "EKSİK FRONTMATTER: $f"
done
comm -23 <(grep -ohE 'skill://[a-z0-9-]+' agents/*.md skills/*/SKILL.md \
             | sed 's|skill://||' | sort -u) <(ls skills | sort)

# kurulum betiği
bash -n install.sh && ./install.sh --dry-run

# izole bir köke gerçek kurulum
PI_CODING_AGENT_DIR=/tmp/omp-verify HOME=/tmp/omp-verify-home ./install.sh
```

The `comm` output **lists 7 skills today** and that list must match the
"Status" column of `docs/skills-reference.md` exactly. If **a name you do not
recognize shows up** here, either a skill is missing or the documentation is
stale — fix both, together with the commit.

Verifying model IDs needs `omp models`; it may make a network call, which
requires the user's permission.

## Commit

- Install/verification output must not go into a commit.
- Do not squash `docs/` and `agents/` changes into a single commit; keep model
  pins, agent text, and documentation traceable in separate commits.
- The trailing dash in the name is not a typo, it is the real name in the
  repo.
