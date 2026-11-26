// Loaded only by the disposable Playwright app server. Auth, Supabase and
// Coach admissions keep their normal network and database boundaries.
import { existsSync } from "node:fs";
import { join } from "node:path";

const network = globalThis.fetch;
// A user message containing this phrase holds the reply mid-stream until the
// test creates `release` in E2E_COACH_STREAM_GATE.
const HOLD = "Hold the reply";
async function released() {
  const release = join(process.env.E2E_COACH_STREAM_GATE ?? "", "release");
  for (let waited = 0; waited < 60_000 && !existsSync(release); waited += 50) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://ai-gateway.vercel.sh") return network(input, options);
  if (url.pathname !== "/v1/chat/completions") throw Error("Unexpected Coach fixture endpoint");

  const id = crypto.randomUUID();
  const body = JSON.parse(String(options?.body ?? "{}"));
  const chunk = (delta, finish_reason = null) => `data: ${JSON.stringify({
    id, object: "chat.completion.chunk", created: 0, choices: [{ index: 0, delta, finish_reason }],
  })}\n\n`;
  const encoder = new TextEncoder();
  const paragraphs = Array.from({ length: 28 }, () =>
    "Keep a steady pace through the working sets and record the final effort.").join("\n\n");
  const tail = paragraphs + "\n\nEnd of the Coach fixture.";
  if (!body.stream) {
    return Promise.resolve(Response.json({
      id, object: "chat.completion", created: 0,
      choices: [{ index: 0, message: { role: "assistant", content: "Durable Coach fixture\n\n" + tail }, finish_reason: "stop" }],
    }));
  }
  const lastUser = (body.messages ?? []).findLast(message => message.role === "user");
  const hold = JSON.stringify(lastUser?.content ?? "").includes(HOLD);
  return Promise.resolve(new Response(new ReadableStream({
    async start(controller) {
      if (hold) {
        controller.enqueue(encoder.encode(chunk({ role: "assistant", content: "Held Coach fixture\n\n" + paragraphs })));
        await released();
        controller.enqueue(encoder.encode(chunk({ content: "\n\nEnd of the Coach fixture." })));
        controller.enqueue(encoder.encode(chunk({}, "stop") + "data: [DONE]\n\n"));
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunk({ role: "assistant", content: "Durable Coach fixture\n\n" })));
      await new Promise(resolve => setTimeout(resolve, 400));
      controller.enqueue(encoder.encode(chunk({ content: tail })));
      controller.enqueue(encoder.encode(chunk({}, "stop") + "data: [DONE]\n\n"));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } }));
};
