import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

if (!globalThis.Blob?.prototype?.arrayBuffer) {
  Object.defineProperty(globalThis, 'Blob', { value: NodeBlob, configurable: true });
}
