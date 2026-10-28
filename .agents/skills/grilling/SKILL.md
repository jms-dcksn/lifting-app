---
name: grilling
description: Use to stress-test a design before building it. Unattended runs record assumed defaults and proceed on reversible choices.
---

# Grilling

Map the design as a tree. Every decision branches into the decisions that hang off it. The frontier is every decision whose prerequisites are already settled: the questions you can ask now without guessing at answers you do not have.

Finding facts is your job. Look them up in the repo. Do not ask the human for anything you can read. The decisions are the human's. In this repo the human is not in the loop mid-run.

## Unattended

Do not wait for answers.

Write the frontier into the PR or issue:

```markdown
## Open questions + assumed defaults

1. **Question.** Default: the answer you are proceeding with. Reversible: yes.
```

Proceed on those defaults. Do not stall. Leave a Decision Card item undone when it is hard to reverse, external-facing, spending, new scope, or an assumption you could not validate. Do not execute that item. The card is recommendation, reason, risk, and the decision needed.

When a human is actually answering in the thread, one round at a time is still right. Number each question and give your recommended answer. Recompute the frontier after each reply. Stop when the frontier is empty and nothing material is still assumed.

Do not use emoji in the questions or the writeup.
