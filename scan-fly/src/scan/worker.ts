/// <reference lib="webworker" />
import { detectDocument } from './detect.ts';
import { detectInBlob, filterPreviews, processPage } from './pipeline.ts';

/** Todo o trabalho pesado de pixels roda aqui, longe da interface. */

export type WorkerRequest =
  | { id: number; kind: 'process'; args: Parameters<typeof processPage>[0] }
  | { id: number; kind: 'detectBlob'; args: Blob }
  | { id: number; kind: 'detectFrame'; args: { data: Uint8ClampedArray; width: number; height: number } }
  | { id: number; kind: 'previews'; args: Parameters<typeof filterPreviews> };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    let result: unknown;
    if (msg.kind === 'process') result = await processPage(msg.args);
    else if (msg.kind === 'detectBlob') result = await detectInBlob(msg.args);
    else if (msg.kind === 'detectFrame') result = detectDocument(msg.args);
    else result = await filterPreviews(...msg.args);
    scope.postMessage({ id: msg.id, ok: true, result });
  } catch (err) {
    scope.postMessage({ id: msg.id, ok: false, error: String((err as Error)?.message ?? err) });
  }
};
