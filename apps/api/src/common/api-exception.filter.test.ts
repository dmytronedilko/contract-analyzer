import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { ERROR_CODES } from '@repo/contracts';

import { AiProviderError } from './ai-provider.error.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

const filter = new ApiExceptionFilter();

/** A Fastify-style error, as raised by the body parser or multipart plugin. */
function fastifyError(statusCode: number, message: string, code: string): Error {
  return Object.assign(new Error(message), { statusCode, code });
}

describe('ApiExceptionFilter.toBody', () => {
  it('keeps the errorCode a domain exception declares', () => {
    const exception = new NotFoundException('Document not found', {
      errorCode: ERROR_CODES.DOCUMENT_NOT_FOUND,
    });
    expect(filter.toBody(exception)).toEqual({
      statusCode: 404,
      message: 'Document not found',
      error: 'Not Found',
      errorCode: 'DOCUMENT_NOT_FOUND',
    });
  });

  it.each([
    [
      new ConflictException('x', { errorCode: ERROR_CODES.DOCUMENT_NOT_READY }),
      409,
      'DOCUMENT_NOT_READY',
    ],
    [new ForbiddenException('x', { errorCode: ERROR_CODES.FORBIDDEN }), 403, 'FORBIDDEN'],
    [
      new UnauthorizedException('x', { errorCode: ERROR_CODES.UNAUTHENTICATED }),
      401,
      'UNAUTHENTICATED',
    ],
  ])('passes through %s', (exception, statusCode, errorCode) => {
    expect(filter.toBody(exception)).toMatchObject({ statusCode, errorCode });
  });

  it('adds VALIDATION_FAILED to 400s without a code and keeps the issue list', () => {
    const exception = new BadRequestException(['question: Too small']);
    expect(filter.toBody(exception)).toEqual({
      statusCode: 400,
      message: ['question: Too small'],
      error: 'Bad Request',
      errorCode: 'VALIDATION_FAILED',
    });
  });

  it('does not override a 400 that already has a code', () => {
    const exception = new BadRequestException('x', { errorCode: ERROR_CODES.FILE_REQUIRED });
    expect(filter.toBody(exception).errorCode).toBe('FILE_REQUIRED');
  });

  it('maps the multipart size limit to 413 FILE_TOO_LARGE', () => {
    expect(filter.toBody(new PayloadTooLargeException('File too large'))).toMatchObject({
      statusCode: 413,
      errorCode: 'FILE_TOO_LARGE',
    });
    expect(
      filter.toBody(fastifyError(413, 'request file too large', 'FST_REQ_FILE_TOO_LARGE')),
    ).toMatchObject({ statusCode: 413, errorCode: 'FILE_TOO_LARGE' });
  });

  it('keeps Fastify client errors and their status', () => {
    const error = fastifyError(400, 'Body is not valid JSON', 'FST_ERR_CTP_INVALID_JSON_BODY');
    expect(filter.toBody(error)).toEqual({
      statusCode: 400,
      message: 'Body is not valid JSON',
      error: 'Bad Request',
      errorCode: 'VALIDATION_FAILED',
    });
  });

  it('maps provider failures to 502 without leaking the provider message', () => {
    const error = new AiProviderError('anthropic', 'invalid x-api-key sk-ant-secret', 401);
    const body = filter.toBody(error);
    expect(body).toEqual({
      statusCode: 502,
      message: 'The AI service is temporarily unavailable. Try again.',
      error: 'Bad Gateway',
      errorCode: 'AI_PROVIDER_UNAVAILABLE',
    });
    expect(JSON.stringify(body)).not.toContain('sk-ant');
  });

  it('hides unexpected errors behind a generic 500', () => {
    const error = new Error('Failed query: insert into document_chunks ... params: secret clause');
    expect(filter.toBody(error)).toEqual({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
    expect(filter.toBody('a thrown string')).toMatchObject({ statusCode: 500 });
  });

  it('hides the message of 5xx HttpExceptions', () => {
    expect(filter.toBody(new InternalServerErrorException('db password is hunter2'))).toEqual({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  });

  it('uses the status text for other 5xx responses', () => {
    const exception = new ServiceUnavailableException('connection refused to 10.0.0.5');
    expect(filter.toBody(exception)).toEqual({
      statusCode: 503,
      message: 'Service Unavailable',
      error: 'Service Unavailable',
    });
  });

  it('ignores unknown error codes', () => {
    const exception = new HttpException({ message: 'x', errorCode: 'NOT_A_CODE' }, 409);
    expect(filter.toBody(exception)).toEqual({ statusCode: 409, message: 'x', error: 'Conflict' });
  });
});

interface FakeReply {
  status: Mock<(code: number) => FakeReply>;
  send: Mock<(body: unknown) => FakeReply>;
}

/** A Fastify-like reply inside a real Nest ArgumentsHost ([request, reply]). */
function httpHost(): { reply: FakeReply; host: ExecutionContextHost } {
  const reply: FakeReply = {
    status: vi.fn<(code: number) => FakeReply>(() => reply),
    send: vi.fn<(body: unknown) => FakeReply>(() => reply),
  };
  return { reply, host: new ExecutionContextHost([{}, reply]) };
}

describe('ApiExceptionFilter.catch', () => {
  it('sends the body with its status', () => {
    const { reply, host } = httpHost();
    filter.catch(new NotFoundException('nope'), host);
    expect(reply.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('logs server errors without their message', () => {
    const { host } = httpHost();
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter.catch(new Error('params: confidential clause text'), host);
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.stringify(log.mock.calls)).not.toContain('confidential clause text');
    log.mockRestore();
  });
});
