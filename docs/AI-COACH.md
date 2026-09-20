# AI Coach

A memory-backed agent that lives in the app. 

This AI will be built around LangChain Typescript SDK - possibly with Deep Agents library.

It should:

- Offer one place in the app as an entry point to all analysis, program building, Q&A, goal setting, app settings updates, weekly review, workout review
- Streaming Chat UI - will need to decide on best approach - we we create custom to be consistent with app design? Are there elements we can take from https://github.com/langchain-ai/agent-chat-ui ? 
- accessible from anywhere in the app
- Can retrieve any data for that user from Supabase
- Has access to all the program templates
- Should we include web search to search latest research trends etc on hypertrophy?
- Program building likely needs a dedicated tool, LLM call or subagent with structured output to emit the structured program and perform the Supabase insert/upserts needed for a newly generated program
- Weekly coach check in should be configurable to be automatic, or manually triggered by the user. Should have a template report structure.
- Program design should take into account a handful of details the user should provide (days per week, goal, body parts to emphasize, machines, free weights, perferences etc. exercises to omit etc) and then also factor in the user's entered lift history in the app to optimize the program structure


## Architecture questions

- What is our LLM connection strategy? Where are keys stored? Vercel AI Gateway? something else?
- Do we use Typescript and keep the agent in the existing framework? Create a separate backend with API routes to the agent in a Python runtime?
- How do we handle the user scoped knowledge and retrieval strategy for the agent? Structured query tooling for supabase?
- Should we include user scoped thread memory for past conversations?
- What guardrails do we need? Tool call limits, cost controls? Custom guardrails to detect off topic or jail breaking?
- Can we give the AI Coach client side tools so it can navigate the app for the user - e.g "Start my next workout" the coach opens the workout for the user and starts it while giving them a note of encouragement.

## Evaluations

- Need to build a dataset
- I will dogfood this for a while and inspect traces on Langsmith - need a dedicated project for this and set up keys etc.

## Presentation

- How should this be presented to the user?
- Do we include the AI Coach in the onboarding experience for the user?
- Where do you access the coach? a persistent icon button in a corner of the app? A dedicated tab/screen?
- 