# MIGRATION — Legacy IndexedDB → PostgreSQL

## Tổng quan

```text
inventory/ (legacy)
    Export JSON (Storage.exportAll)
           |
           v
    legacy-backup-YYYY-MM-DD.json
           |
           v
tools/inventory-migration/     [PHASE 11 — chưa implement]
    --dry-run  → phân tích + migration-report.json
    --execute  → ghi PostgreSQL + verify
           |
           v
inventory-online PostgreSQL (Supabase)
```

## Backup bắt buộc (STEP 1)

Trước mọi thao tác migrate:

1. Mở legacy app → **Cài đặt** → **Export toàn bộ dữ liệu**, hoặc
2. Copy `inventory/Database/latest.json`

Lưu thành: `legacy-backup-YYYY-MM-DD.json`

## Deploy schema (STEP 2–3)

1. Tạo project Supabase PostgreSQL.
2. Cài mới: chạy `database/schema-legacy.sql` hoặc migrations V001 + V011 ([database/README.md](../database/README.md)).
3. Deploy backend API (PHASE 2+) trước khi import data production.

## Import legacy data (STEP 4)

**Thứ tự insert (FK-safe):**

1. categories
2. products (copy `stock` trực tiếp)
3. transactions
4. export_slips (items + out/return transaction IDs JSONB)
5. import_slips (items + in/return transaction IDs JSONB)
6. Verify `products.stock` vs sum transactions

## Validation (trước `--execute`)

- JSON schema: required arrays `products`, `transactions`
- Duplicate `legacy_id` / `code` per entity
- `productId` tồn tại trên mọi transaction / slip item
- Quantity rules: IN/OUT > 0; ADJUST ≠ 0
- Slip status ∈ {PROCESSING, COMPLETED, RETURNED}
- `outTransactionIds` / `inTransactionIds` trỏ tới transaction legacy_id hợp lệ

Lỗi → `migration-errors.json` (không silent ignore).

## Verification (STEP 5–7)

| Check | Legacy | PostgreSQL |
|-------|--------|------------|
| products.count | n | n |
| transactions.count | n | transactions.count |
| categories.count | n | n |
| exportSlips.count | n | n |
| importSlips.count | n | n |

**Stock per product:**

```text
legacy product.stock
  == products.stock
  == SUM(stockDelta(transactions))   // IN +, OUT -, ADJUST +
```

Mismatch → **MIGRATION FAIL** — không go-live.

Output: `migration-report.json` (counts, mismatches, skipped, failed).

## Cutover (STEP 8–10)

1. Regression tests pass (business rules doc)
2. Deploy React frontend (PHASE 10)
3. Users login JWT
4. Legacy app chỉ đọc — không ghi IndexedDB nghiệp vụ
5. Giữ source `inventory/` trên branch `legacy-indexeddb`

## Tool CLI (planned)

```bash
dotnet run --project tools/inventory-migration -- \
  --input ../legacy-backup.json \
  --connection "$DATABASE_URL" \
  --dry-run

dotnet run --project tools/inventory-migration -- \
  --input ../legacy-backup.json \
  --connection "$DATABASE_URL" \
  --execute
```

## Tài liệu liên quan

- [LEGACY-INDEXEDDB.md](LEGACY-INDEXEDDB.md)
- [LEGACY-BUSINESS-RULES.md](LEGACY-BUSINESS-RULES.md)
- [DATABASE-MAPPING.md](DATABASE-MAPPING.md)
- [MIGRATION-ISSUES.md](MIGRATION-ISSUES.md)
