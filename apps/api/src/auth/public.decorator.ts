import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Opts a route out of authentication. Used only by the health endpoints. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
