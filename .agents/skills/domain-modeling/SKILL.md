---
name: domain-modeling
description: Use when sharpening a domain term or recording a decision. Glossary in docs/GLOSSARY.md. Decisions in docs/DECISIONS.md.
---

# Domain modeling

Sharpen the project's language while you design. Challenge a fuzzy term, invent a concrete scenario that forces a boundary, and write the result down when it crystallizes. Reading existing docs for vocabulary is not this skill. This skill is for changing the model.

## Where words and decisions live

- **Glossary.** Optional `docs/GLOSSARY.md`. A `.md` file directly under `docs/` is versioned. Do not create a new folder under `docs/`. Do not create `CONTEXT.md` or `docs/adr/`.
- **Decisions.** `docs/DECISIONS.md` is the log. Match its voice: a short heading, what was decided, and why. Do not open a second decision format.

Create `docs/GLOSSARY.md` only when the first term is worth recording. Until then, use the words already in the code and in `docs/DECISIONS.md`.

Glossary entry:

```markdown
**Term**: one or two sentences about what it is.
_Avoid_: synonyms that mean something else here
```

Keep definitions tight. Include a term only when it is specific to this app. "Timeout" and "component" do not belong. Group terms under a heading when a cluster is obvious.

## While you work

- When a word conflicts with the glossary or with `docs/DECISIONS.md`, say so. Pick one meaning.
- When a word is doing two jobs ("account"), propose the precise term and use it.
- Stress-test a relationship with a concrete scenario, including the edge that breaks a sloppy definition.
- When the user states how something works, check the code. If they disagree, surface it. Do not quietly rewrite a locked decision.

## What to record

Update the glossary as soon as a term is resolved.

Append to `docs/DECISIONS.md` only when all three are true:

1. Hard to reverse.
2. Surprising without the context.
3. The result of a real trade-off.

If one is missing, skip the log entry. An easy-to-reverse choice does not need a ceremony.

A decision that is not yet approved is a Decision Card in the PR, not a new heading in `docs/DECISIONS.md`: recommendation, reason, risk, and the decision needed.

Unattended: if a term is ambiguous and the choice is reversible, record the assumption under "Open questions + assumed defaults" and proceed. If the choice would change a locked decision, stop that part and file the conflict. Do not rewrite the lock.
