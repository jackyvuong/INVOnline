-- V012: Google OAuth users + ghi nhận email thao tác

BEGIN;

-- users: Google login (bỏ password bắt buộc)
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(256);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';

UPDATE users SET google_sub = email WHERE google_sub IS NULL AND email IS NOT NULL;

ALTER TABLE users ALTER COLUMN google_sub SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_sub ON users (google_sub);

-- Audit email trên mọi bảng nghiệp vụ
ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS created_by_email VARCHAR(256) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS updated_by_email VARCHAR(256) NOT NULL DEFAULT '';

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS created_by_email VARCHAR(256) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS updated_by_email VARCHAR(256) NOT NULL DEFAULT '';

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS created_by_email VARCHAR(256) NOT NULL DEFAULT '';

ALTER TABLE export_slips
    ADD COLUMN IF NOT EXISTS created_by_email VARCHAR(256) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS updated_by_email VARCHAR(256) NOT NULL DEFAULT '';

ALTER TABLE import_slips
    ADD COLUMN IF NOT EXISTS created_by_email VARCHAR(256) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS updated_by_email VARCHAR(256) NOT NULL DEFAULT '';

INSERT INTO schema_migrations (version, name)
VALUES ('V012', 'google_auth_and_audit')
ON CONFLICT (version) DO NOTHING;

COMMIT;
