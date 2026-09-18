// Validate the MP4/M4A container, not caller-supplied MIME metadata. This rejects
// text masquerading as a recording and incomplete uploads; it is not a codec decoder.
export function isFeedbackAudioContainer(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  let hasType = false;
  let hasMetadata = false;
  let hasMedia = false;
  while (offset + 8 <= bytes.length) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length) return false;
      const extendedSize = view.getBigUint64(offset + 8);
      if (extendedSize > BigInt(bytes.length - offset)) return false;
      size = Number(extendedSize);
      headerSize = 16;
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    if (size < headerSize || size > bytes.length - offset) return false;
    if (offset === 0 && type !== 'ftyp') return false;
    if (type === 'ftyp' && size > headerSize) hasType = true;
    if (type === 'moov' && size > headerSize) hasMetadata = true;
    if (type === 'mdat' && size > headerSize) hasMedia = true;
    offset += size;
  }
  return offset === bytes.length && hasType && hasMetadata && hasMedia;
}
