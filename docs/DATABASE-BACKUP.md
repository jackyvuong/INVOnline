# DATABASE BACKUP — Supabase PostgreSQL

## Nguyên tắc

- **Không** lưu backup PostgreSQL trên filesystem Render (ephemeral).
- Backup chính: **Supabase** + optional `pg_dump` off-site.

## Supabase built-in

- Supabase Pro+: daily backups, point-in-time recovery (theo gói).
- Free tier: dùng manual `pg_dump` định kỳ.

## Manual backup (`pg_dump`)

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --file="qltk-pg-backup-$(date +%Y%m%d-%H%M%S).dump"
```

Restore (test trên DB staging, không production trực tiếp nếu chưa verify):

```bash
pg_restore --clean --if-exists \
  --dbname="$STAGING_DATABASE_URL" \
  qltk-pg-backup-YYYYMMDD-HHMMSS.dump
```

## Lịch đề xuất (5 users, internal)

| Tần suất | Hành động |
|----------|-----------|
| Hàng ngày | `pg_dump` → cloud storage (S3/Drive) |
| Trước migrate | Full dump + legacy JSON export |
| Trước deploy schema | Dump staging |

## Retention

- Daily: giữ 7 bản
- Weekly: giữ 4 bản
- Pre-migration: giữ vĩnh viễn (archive)

## Disaster recovery

1. Provision DB mới (Supabase)
2. `pg_restore` bản dump mới nhất
3. Point API `DATABASE_URL` env trên Render
4. Verify health + stock spot-check
5. Redeploy frontend nếu cần

## Legacy JSON

Giữ song song file `legacy-backup-*.json` từ app cũ — không thay thế PG backup nhưng hữu ích cho re-import / audit.

## Secrets

Connection string chỉ trên:

- Render env (backend)
- Local `.env` (dev, gitignored)
- CI secrets

Không commit `.env`, không đưa vào frontend.
