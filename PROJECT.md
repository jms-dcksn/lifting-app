# Lifting App — Project board & 90-day scope freeze

Kanban workstreams (intended GitHub Projects **Status** columns):

| Status | Meaning |
|--------|---------|
| **Now** | 90-day wedge (complete) plus in-app AI Coach slices, starting at Slice 0 |
| **Feedback** | User feedback from the friend / future users |
| **Dogfood** | James's own improvement notes from using the app |
| **Later** | Parked: native iOS migration, Deep Agents / in-session agent, and other out-of-scope items |

## 90-day scope freeze rules

1. **Wedge plus locked AI Coach.** The 90-day wedge is shipped. Active delivery is the
   [AI Coach slices](docs/AI-COACH.md), starting at Slice 0. Do not pull other **Later**
   work into the current slice without an explicit scope change.
2. **Feedback ≠ Now.** Capture friend/user notes under **Feedback**; promote to **Now** only when it unblocks the wedge or is a clear P0 for the first user.
3. **Dogfood stays personal.** James's usage notes live in **Dogfood**; promote selectively so personal polish does not crowd out friend-critical work.
4. **Later is a parking lot.** Native iOS, Deep Agents, web search, and in-session agent
   presence stay in **Later** until their slice (see [AI-COACH.md](docs/AI-COACH.md) Slice 5).
5. **Prefer issues over silent scope creep.** New ideas get an issue labeled with the intended status; debate happens on the issue, not by quietly expanding **Now**.

## Board setup (manual if automation lacked Projects access)

1. Create a user Project (Projects V2), e.g. **Lifting App — 90 days**.
2. Set **Status** options to: `Now`, `Feedback`, `Dogfood`, `Later` (keep `Done`/`Backlog` if the template requires them).
3. Link repository `jms-dcksn/lifting-app`.
4. Add starter issues and set Status to match their `[NOW]` / `[FEEDBACK]` / `[DOGFOOD]` / `[LATER]` title prefixes.

Open projects: https://github.com/users/jms-dcksn/projects
