import * as CFB from 'cfb';

/**
 * Read Altium binary SchDoc (OLE2 compound file) and return the `FileHeader` stream bytes.
 */
export function readFileHeaderStream(buf: Uint8Array): Uint8Array {
  const cfb = CFB.read(buf, { type: 'buffer' });
  const entry = CFB.find(cfb, 'FileHeader');
  if (!entry || !entry.content) {
    throw new Error('Invalid SchDoc: missing FileHeader stream (not an Altium OLE schematic?)');
  }
  const content = entry.content as ArrayBuffer | Uint8Array;
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}
