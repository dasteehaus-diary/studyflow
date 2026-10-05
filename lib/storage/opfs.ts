const ROOT_DIR = 'documents';

function assertBrowser() {
  if (typeof window === 'undefined') {
    throw new Error('OPFS is only available in the browser.');
  }
}

export function supportsOPFS() {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
}

async function getDocumentsDir() {
  assertBrowser();
  if (!supportsOPFS()) {
    throw new Error('This browser does not expose OPFS (navigator.storage.getDirectory).');
  }
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(ROOT_DIR, { create: true });
}

export async function requestPersistentStorage() {
  assertBrowser();
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function isPersistentStorageGranted() {
  assertBrowser();
  if (!navigator.storage?.persisted) return false;
  return navigator.storage.persisted();
}

export async function savePdfToOPFS(documentId: string, file: File) {
  const dir = await getDocumentsDir();
  const handle = await dir.getFileHandle(`${documentId}.pdf`, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
  return `${ROOT_DIR}/${documentId}.pdf`;
}

export async function readPdfFromOPFS(documentId: string) {
  const dir = await getDocumentsDir();
  const handle = await dir.getFileHandle(`${documentId}.pdf`);
  return handle.getFile();
}

export async function pdfExistsInOPFS(documentId: string) {
  try {
    await readPdfFromOPFS(documentId);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false;
    throw error;
  }
}

export async function removePdfFromOPFS(documentId: string) {
  const dir = await getDocumentsDir();
  try {
    await dir.removeEntry(`${documentId}.pdf`);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return;
    throw error;
  }
}
