import { Client } from "langsmith";
import resources from "./datasets/langsmith-resources.json";

export function experimentMetadata(suite: string) {
  return { app: resources.application, environment: "dev", source: "experiment", suite };
}

/** evaluate() creates its own dataset-linked project; group it at creation time. */
export class ExperimentClient extends Client {
  constructor() {
    super({ workspaceId: process.env.LANGSMITH_WORKSPACE_ID?.trim() || resources.workspaceId });
  }

  override createProject(input: Parameters<Client["createProject"]>[0]) {
    return super.createProject({ ...input,
      tagValueIds: [...new Set([...(input.tagValueIds ?? []), resources.applicationTagValueId, resources.developmentTagValueId])],
    });
  }
}
