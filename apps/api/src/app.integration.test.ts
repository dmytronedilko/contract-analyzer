import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Document } from '@repo/contracts';

import { auditEvents, documentChunks, member, organization } from '@repo/db';

import { addMember, createTestApp, type TestApp } from './test/app.js';
import {
  connectTestDatabase,
  hasTestDatabase,
  seedOrganization,
  type TestDatabase,
} from './test/database.js';
import { buildPdf, multipartFile } from './test/pdf.js';

const QUESTION = 'What is the initial term of the agreement?';
const CONTRACT = buildPdf([
  '1. Term\nThe initial term of this Agreement is 24 months from the Effective Date.',
  '2. Fees\nThe Customer shall pay EUR 10,000 per year, invoiced annually in advance.',
  '3. Termination\nEither party may terminate for convenience on 90 days written notice.',
]);
const ANALYSIS_LIMIT = 5;

describe.skipIf(!hasTestDatabase)('API integration (Postgres)', () => {
  let database: TestDatabase;
  let testApp: TestApp;
  let orgA: { organizationId: string; userId: string };
  let orgB: { organizationId: string; userId: string };
  let tokenA: string;
  let tokenB: string;

  const request = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    token: string,
    body?: Record<string, string>,
  ) =>
    testApp.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { payload: body }),
    });

  async function upload(token: string, pdf = CONTRACT, filename = 'msa-2026.pdf') {
    const { payload, headers } = multipartFile(pdf, filename);
    return testApp.app.inject({
      method: 'POST',
      url: '/documents/upload',
      headers: { ...headers, authorization: `Bearer ${token}` },
      payload,
    });
  }

  beforeAll(async () => {
    database = connectTestDatabase();
    testApp = await createTestApp({
      RATE_LIMIT_ANALYSIS_PER_MINUTE: String(ANALYSIS_LIMIT),
    });
    orgA = await seedOrganization(database.db, 'owner');
    orgB = await seedOrganization(database.db, 'owner');
    tokenA = await testApp.tokens.sign({ sub: orgA.userId, org: orgA.organizationId });
    tokenB = await testApp.tokens.sign({ sub: orgB.userId, org: orgB.organizationId });
  });

  afterAll(async () => {
    for (const org of [orgA, orgB]) {
      await database.db.delete(organization).where(eq(organization.id, org.organizationId));
    }
    await testApp?.close();
    await database.close();
  });

  describe('ingestion and analysis', () => {
    it('ingests a PDF and answers questions with page-mapped sources', async () => {
      const uploaded = await upload(tokenA);
      expect(uploaded.statusCode).toBe(201);
      const document = uploaded.json<Document>();
      expect(document).toMatchObject({
        filename: 'msa-2026.pdf',
        status: 'ready',
        pageCount: 3,
        uploadedBy: { id: orgA.userId },
        error: null,
      });
      expect(document.chunkCount).toBeGreaterThan(0);
      expect(document.hasFile).toBe(true);

      const file = await request('GET', `/documents/${document.id}/file`, tokenA);
      expect(file.statusCode).toBe(200);
      expect(file.headers).toMatchObject({
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="msa-2026.pdf"; filename*=UTF-8''msa-2026.pdf`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      });
      expect(file.rawPayload.equals(CONTRACT)).toBe(true);

      const asked = await request('POST', '/analysis/ask', tokenA, {
        documentId: document.id,
        question: QUESTION,
      });
      expect(asked.statusCode).toBe(200);
      const answer = asked.json<{
        answer: string;
        sources: Array<{ ref: number; pageStart: number }>;
      }>();
      expect(answer.answer).toContain('[chunk 1, p. 1]');
      expect(answer.sources[0]).toMatchObject({ ref: 1, pageStart: 1 });

      const prompt = testApp.llm.calls.at(-1)!.user;
      expect(prompt).toContain('initial term of this Agreement is 24 months');
      expect(prompt).toContain(`<question>\n${QUESTION}\n</question>`);
    });

    it('marks a scanned PDF failed with 422 PDF_NO_TEXT_LAYER', async () => {
      const response = await upload(tokenA, buildPdf([null, null]), 'scan.pdf');
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ errorCode: 'PDF_NO_TEXT_LAYER' });
      const list = await request('GET', '/documents', tokenA);
      expect(list.json<{ items: Document[] }>().items[0]).toMatchObject({
        filename: 'scan.pdf',
        status: 'failed',
      });
    });
  });

  describe('tenant isolation', () => {
    let documentA: Document;
    let documentB: Document;

    beforeAll(async () => {
      documentA = (await upload(tokenA)).json<Document>();
      documentB = (await upload(tokenB)).json<Document>();
    });

    it("returns 404 for another organization's document on get, file and delete", async () => {
      for (const [method, path] of [
        ['GET', ''],
        ['GET', '/file'],
        ['DELETE', ''],
      ] as const) {
        const response = await request(method, `/documents/${documentA.id}${path}`, tokenB);
        expect(response.statusCode).toBe(404);
        expect(response.json()).toMatchObject({ errorCode: 'DOCUMENT_NOT_FOUND' });
      }
      expect((await request('GET', `/documents/${documentA.id}`, tokenA)).statusCode).toBe(200);
      expect((await request('GET', `/documents/${documentA.id}/file`, tokenA)).statusCode).toBe(
        200,
      );
    });

    it("returns 404 when asking about or comparing another organization's document", async () => {
      const asked = await request('POST', '/analysis/ask', tokenB, {
        documentId: documentA.id,
        question: QUESTION,
      });
      expect(asked.statusCode).toBe(404);

      const compared = await request('POST', '/analysis/compare', tokenB, {
        documentId1: documentB.id,
        documentId2: documentA.id,
        query: 'termination',
      });
      expect(compared.statusCode).toBe(404);
      expect(compared.json()).toMatchObject({ errorCode: 'DOCUMENT_NOT_FOUND' });
    });

    it("never lists another organization's documents", async () => {
      const listA = (await request('GET', '/documents?limit=100', tokenA)).json<{
        items: Document[];
        total: number;
      }>();
      const listB = (await request('GET', '/documents?limit=100', tokenB)).json<{
        items: Document[];
        total: number;
      }>();
      expect(listB.items.map((d) => d.id)).toEqual([documentB.id]);
      expect(listB.total).toBe(1);
      expect(listA.items.map((d) => d.id)).not.toContain(documentB.id);
    });

    it('keeps the document after a rejected cross-organization delete', async () => {
      await request('DELETE', `/documents/${documentA.id}`, tokenB);
      const chunks = await database.db
        .select({ id: documentChunks.id })
        .from(documentChunks)
        .where(eq(documentChunks.documentId, documentA.id));
      expect(chunks.length).toBe(documentA.chunkCount);
    });
  });

  describe('audit events', () => {
    it('records upload, ask, compare and delete without questions, answers or filenames', async () => {
      const first = (await upload(tokenA, CONTRACT, 'secret-deal-alpha.pdf')).json<Document>();
      const second = (await upload(tokenA, CONTRACT, 'secret-deal-beta.pdf')).json<Document>();
      await request('POST', '/analysis/ask', tokenA, { documentId: first.id, question: QUESTION });
      await request('POST', '/analysis/compare', tokenA, {
        documentId1: first.id,
        documentId2: second.id,
        query: 'termination for convenience',
      });
      expect((await request('DELETE', `/documents/${second.id}`, tokenA)).statusCode).toBe(204);

      const rows = await database.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.organizationId, orgA.organizationId));
      const forDocuments = rows.filter((row) => [first.id, second.id].includes(row.targetId ?? ''));
      expect(forDocuments.map((row) => row.action).toSorted()).toEqual(
        [
          'analysis.ask',
          'analysis.compare',
          'document.delete',
          'document.upload',
          'document.upload',
        ].toSorted(),
      );
      for (const row of forDocuments) {
        expect(row.actorId).toBe(orgA.userId);
        expect(row.requestId).toMatch(/^[0-9a-f-]{36}$/);
      }
      expect(forDocuments.find((row) => row.action === 'analysis.ask')!.metadata).toMatchObject({
        sourceCount: expect.any(Number),
        truncated: false,
        durationMs: expect.any(Number),
      });

      const serialized = JSON.stringify(rows);
      for (const secret of [
        QUESTION,
        'termination for convenience',
        testApp.llm.answer,
        'secret-deal',
      ]) {
        expect(serialized).not.toContain(secret);
      }
    });

    it('serves the audit log to owners, newest first, filtered by action', async () => {
      const response = await request('GET', '/audit-events?action=document.delete', tokenA);
      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: Array<{ action: string; actor: { id: string } }> }>();
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.every((item) => item.action === 'document.delete')).toBe(true);
      expect(body.items[0]!.actor.id).toBe(orgA.userId);
    });
  });

  describe('membership changes', () => {
    it("applies a member's removal on their very next request", async () => {
      const memberId = await addMember(database.db, orgA.organizationId, 'member');
      const token = await testApp.tokens.sign({ sub: memberId, org: orgA.organizationId });
      expect((await request('GET', '/documents', token)).statusCode).toBe(200);

      await database.db
        .delete(member)
        .where(and(eq(member.userId, memberId), eq(member.organizationId, orgA.organizationId)));

      const response = await request('GET', '/documents', token);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ errorCode: 'FORBIDDEN' });
    });

    it('applies a role change on the next request', async () => {
      const memberId = await addMember(database.db, orgA.organizationId, 'member');
      const token = await testApp.tokens.sign({ sub: memberId, org: orgA.organizationId });
      expect((await request('GET', '/audit-events', token)).statusCode).toBe(403);
      await database.db.update(member).set({ role: 'admin' }).where(eq(member.userId, memberId));
      expect((await request('GET', '/audit-events', token)).statusCode).toBe(200);
    });
  });

  describe('rate limits', () => {
    it('returns 429 RATE_LIMITED with Retry-After once a user exceeds the analysis limit', async () => {
      const userId = await addMember(database.db, orgA.organizationId, 'viewer');
      const token = await testApp.tokens.sign({ sub: userId, org: orgA.organizationId });
      const ask = () =>
        request('POST', '/analysis/ask', token, {
          documentId: '00000000-0000-4000-8000-000000000000',
          question: QUESTION,
        });

      for (let i = 0; i < ANALYSIS_LIMIT; i++) expect((await ask()).statusCode).toBe(404);
      const limited = await ask();
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({ errorCode: 'RATE_LIMITED' });
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

      // Limits are per user: another member of the same organization is unaffected.
      expect(
        (
          await request('POST', '/analysis/ask', tokenA, {
            documentId: '00000000-0000-4000-8000-000000000000',
            question: QUESTION,
          })
        ).statusCode,
      ).toBe(404);
    });
  });
});
