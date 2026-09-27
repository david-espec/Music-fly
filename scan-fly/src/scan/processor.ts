import { detectDocument, type Detection } from './detect.ts';
import * as local from './pipeline.ts';
import type { ProcessRequest, ProcessResult } from './pipeline.ts';
import type { FilterId, Quad, Rotation } from './types.ts';
import type { WorkerRequest } from './worker.ts';

/**
 * Fachada do processamento. Usa o worker quando o navegador tem
 * OffscreenCanvas (quase todos hoje); sem ele, roda o mesmo codigo na janela.
 */

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
  }
  return worker;
}

type Req = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

function call<T>(req: Req, transfer: Transferable[] = []): Promise<T> {
  const w = getWorker();
  if (w) {
    return new Promise<T>((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      w.postMessage({ ...req, id }, transfer);
    });
  }
  const run = async (): Promise<unknown> => {
    if (req.kind === 'process') return local.processPage(req.args);
    if (req.kind === 'detectBlob') return local.detectInBlob(req.args);
    if (req.kind === 'detectFrame') return detectDocument(req.args);
    return local.filterPreviews(...req.args);
  };
  return run() as Promise<T>;
}

export const processPage = (args: ProcessRequest) => call<ProcessResult>({ kind: 'process', args });

export const detectBlob = (blob: Blob) => call<Detection | null>({ kind: 'detectBlob', args: blob });

export function detectFrame(frame: ImageData) {
  const data = frame.data;
  return call<Detection | null>(
    { kind: 'detectFrame', args: { data, width: frame.width, height: frame.height } },
    [data.buffer],
  );
}

export const filterPreviews = (original: Blob, quad: Quad, rotation: Rotation, filters: FilterId[]) =>
  call<Partial<Record<FilterId, Blob>>>({ kind: 'previews', args: [original, quad, rotation, filters] });
