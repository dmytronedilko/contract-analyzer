/**
 * Public configuration, inlined into the client bundle at build time (NEXT_PUBLIC_*). It must
 * mirror the API's MAX_UPLOAD_MB; one image serves every environment, so it is a build argument.
 */
export const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 25) || 25;
