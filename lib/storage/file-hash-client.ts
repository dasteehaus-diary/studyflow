'use client';

import { sha256File } from './file-hash';

type HashWorkerMessage =
  | { type: 'progress'; value: number }
  | { type: 'done'; hash: string }
  | { type: 'error'; message: string };

export async function sha256FileInWorker(
  file: File,
  onProgress?: (fraction: number) => void
) {
  if (typeof Worker === 'undefined') {
    return sha256File(file, undefined, onProgress);
  }

  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/fileHash.worker.ts', import.meta.url), {
      type: 'module'
    });

    const cleanUp = () => worker.terminate();

    worker.onmessage = (event: MessageEvent<HashWorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress?.(message.value);
        return;
      }
      if (message.type === 'done') {
        cleanUp();
        resolve(message.hash);
        return;
      }
      cleanUp();
      reject(new Error(message.message));
    };

    worker.onerror = (event) => {
      cleanUp();
      reject(new Error(event.message || 'File hashing worker failed.'));
    };

    worker.postMessage({ file });
  });
}
