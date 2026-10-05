/// <reference lib="webworker" />

import { createSHA256 } from 'hash-wasm';

type HashRequest = {
  file: File;
  chunkSize?: number;
};

type HashWorkerMessage =
  | { type: 'progress'; value: number }
  | { type: 'done'; hash: string }
  | { type: 'error'; message: string };

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<HashRequest>) => {
  try {
    const { file, chunkSize = 4 * 1024 * 1024 } = event.data;
    const hasher = await createSHA256();
    hasher.init();

    if (file.size === 0) {
      workerScope.postMessage({ type: 'progress', value: 1 } satisfies HashWorkerMessage);
      workerScope.postMessage({ type: 'done', hash: hasher.digest() } satisfies HashWorkerMessage);
      return;
    }

    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const chunk = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer());
      hasher.update(chunk);
      workerScope.postMessage({
        type: 'progress',
        value: Math.min(1, (offset + chunk.byteLength) / file.size)
      } satisfies HashWorkerMessage);
    }

    workerScope.postMessage({ type: 'done', hash: hasher.digest() } satisfies HashWorkerMessage);
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    } satisfies HashWorkerMessage);
  }
};

export {};
