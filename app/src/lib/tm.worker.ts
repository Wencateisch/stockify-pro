import { runTimeMachine } from "./timemachine";
import type { TMInput } from "./types";

self.onmessage = (event: MessageEvent<{ id: string; input: TMInput }>) => {
  const { id, input } = event.data;
  try {
    const result = runTimeMachine(input);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
