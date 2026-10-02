const JEV_URL = "https://api.typesafe.ai/v1/systemone";

type NoulQuestion = {
  type: "noul";
  instructions: string | Record<string, unknown>;
  criteria?: { true?: string; false?: string };
};

type JevRequest = {
  state: unknown;
  questions: Record<string, NoulQuestion>;
};

export async function askJev(request: JevRequest) {
  const apiKey = process.env.JEV_API_KEY?.trim();
  if (!apiKey) throw new Error("JEV_API_KEY is not set");

  const response = await fetch(JEV_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jev-latest",
      state: request.state,
      questions: request.questions,
    }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Jev returned ${response.status}`);
  }
  return noulAnswers(body);
}

function noulAnswers(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("Jev returned an empty body");
  const record = body as { answers?: unknown; result?: { answers?: unknown } };
  const answers = record.answers ?? record.result?.answers;
  if (!answers || typeof answers !== "object") {
    throw new Error(`Jev response missing answers (${Object.keys(record).join(", ") || "no keys"})`);
  }
  const nouls: Record<string, number> = {};
  for (const [id, answer] of Object.entries(answers)) {
    const noul = answer && typeof answer === "object" && "noul" in answer
      ? (answer as { noul?: unknown }).noul
      : undefined;
    if (typeof noul !== "number") throw new Error(`Jev answer ${id} has no noul`);
    nouls[id] = noul;
  }
  return nouls;
}
