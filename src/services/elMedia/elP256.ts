// Loaded lazily by elEs256's signature check. A module import, unlike a bare
// require('@noble/curves/nist.js'), resolves the package's ESM build, which shares
// @noble/hashes with the SHA-256 code already in the bundle instead of adding the
// CommonJS copies of both packages.
export { p256 } from '@noble/curves/nist.js';
