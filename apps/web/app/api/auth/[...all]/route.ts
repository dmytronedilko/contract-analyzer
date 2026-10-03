import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The Better Auth instance is created on the first request, never during `next build`.
export const GET = (request: Request) => toNextJsHandler(auth()).GET(request);
export const POST = (request: Request) => toNextJsHandler(auth()).POST(request);
