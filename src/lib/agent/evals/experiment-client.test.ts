import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "langsmith";
import { ExperimentClient, experimentMetadata } from "./experiment-client";
import resources from "./datasets/langsmith-resources.json";

describe("dataset-linked experiment grouping", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("preserves the SDK experiment identity, dataset link, metadata and existing tags", async () => {
    vi.stubEnv("LANGSMITH_PROJECT", "lifting-app-dev");
    const create = vi.spyOn(Client.prototype, "createProject").mockResolvedValue({ id: "experiment", tenant_id: resources.workspaceId, start_time: 0 });
    const client = new ExperimentClient();
    await client.createProject({ projectName: "weekly-coach-sdk-generated", referenceDatasetId: "dataset-id",
      metadata: { ...experimentMetadata("weekly-coach"), codeSha: "sha", datasetVersion: "version" }, tagValueIds: ["existing"] });
    expect(create).toHaveBeenCalledWith({ projectName: "weekly-coach-sdk-generated", referenceDatasetId: "dataset-id",
      metadata: { app: "lifting-app", environment: "dev", source: "experiment", suite: "weekly-coach", codeSha: "sha", datasetVersion: "version" },
      tagValueIds: ["existing", resources.applicationTagValueId, resources.developmentTagValueId] });
    expect(process.env.LANGSMITH_PROJECT).toBe("lifting-app-dev");
  });
});
