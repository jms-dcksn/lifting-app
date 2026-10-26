import { writeFileSync } from "node:fs";
import { WEEKLY_EXAMPLES } from "../src/lib/agent/evals/weekly-cases";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--output" || !args[1]) {
  throw new Error("Use npm run eval:weekly:export -- --output /private/tmp/weekly-coach-v1.json (new file only). No remote operations.");
}
writeFileSync(args[1], JSON.stringify(WEEKLY_EXAMPLES, null, 2) + "\n", { flag: "wx" });
console.log(`Wrote ${WEEKLY_EXAMPLES.length} synthetic examples to ${args[1]}. No sync or model calls.`);
