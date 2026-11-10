import { Mastra } from "@mastra/core";

let mastraInstance = null;

export function getMastra() {
  if (!mastraInstance) {
    mastraInstance = new Mastra({
      agents: {},
      workflows: {},
      // Disable Mastra's built-in OpenTelemetry telemetry entirely
      // We don't want any background tracing or data export
      telemetry: {
        enabled: false,
      },
    });
  }
  return mastraInstance;
}

export const mastra = getMastra();