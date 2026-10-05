import { createSHA256 } from 'hash-wasm';

export async function sha256File(
  file: Blob,
  chunkSize = 4 * 1024 * 1024,
  onProgress?: (fraction: number) => void
) {
  const hasher = await createSHA256();
  hasher.init();

  if (file.size === 0) {
    onProgress?.(1);
    return hasher.digest();
  }

  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const chunk = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer());
    hasher.update(chunk);
    onProgress?.(Math.min(1, (offset + chunk.byteLength) / file.size));
  }

  return hasher.digest();
}
