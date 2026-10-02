-- drizzle-kit does not manage extensions. The vector type used by document_chunks.embedding
-- must exist before the table migrations run. Requires pgvector >= 0.8.
CREATE EXTENSION IF NOT EXISTS vector;
