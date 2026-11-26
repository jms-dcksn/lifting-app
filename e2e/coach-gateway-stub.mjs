// Loaded only by the disposable Playwright app server. Auth, Supabase and
// Coach admissions keep their normal network and database boundaries.
const network = globalThis.fetch;
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
  return Promise.resolve(new Response(new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(chunk({ role: "assistant", content: "Durable Coach fixture\n\n" })));
      await new Promise(resolve => setTimeout(resolve, 400));
      controller.enqueue(encoder.encode(chunk({ content: tail })));
      controller.enqueue(encoder.encode(chunk({}, "stop") + "data: [DONE]\n\n"));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } }));
};
