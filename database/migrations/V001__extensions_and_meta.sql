-- V001: Extensions + schema migration tracking
-- Target: PostgreSQL 15+ (Supabase)

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(32)  PRIMARY KEY,
    name        VARCHAR(256) NOT NULL,
    applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name)
VALUES ('V001', 'extensions_and_meta')
ON CONFLICT (version) DO NOTHING;

COMMIT;
