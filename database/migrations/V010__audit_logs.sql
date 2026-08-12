-- V010: Audit logs

BEGIN;

CREATE TABLE audit_logs (
    id           BIGSERIAL   PRIMARY KEY,
    user_id      BIGINT      REFERENCES users (id) ON DELETE SET NULL,
    action       VARCHAR(64) NOT NULL,
    entity_type  VARCHAR(64) NOT NULL,
    entity_id    BIGINT,
    details      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    ip_address   INET,
    trace_id     VARCHAR(64),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX ix_audit_logs_action ON audit_logs (action);
CREATE INDEX ix_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at DESC);

INSERT INTO schema_migrations (version, name)
VALUES ('V010', 'audit_logs')
ON CONFLICT (version) DO NOTHING;

COMMIT;
