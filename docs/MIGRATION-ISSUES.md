# MIGRATION ISSUES — Legacy vs Migration Prompt Template

> Các điểm **không khớp** giữa template migration (Receipt/Issue/Warehouse/POST-CANCEL) và **hệ thống thực tế** `inventory/`.  
> **Không tự ý quyết định** — cần chốt trước PHASE 1 schema.

---

## ISSUE-001: Không có Warehouse

| | |
|---|---|
| **Template giả định** | `warehouses`, `inventories(product_id, warehouse_id)` |
| **Legacy thực tế** | Single implicit warehouse |
| **Affected records** | Tất cả products/transactions |
| **Current behavior** | Một tồn duy nhất trên `product.stock` |
| **Options** | (A) Seed 1 warehouse `DEFAULT` — **recommended** (B) Bỏ warehouse table |
| **Recommended** | **A** — chuẩn bị multi-warehouse sau này, migration map warehouse_id=1 |

---

## ISSUE-002: Không có Receipt / Issue / Adjustment documents

| | |
|---|---|
| **Template giả định** | `receipt_documents`, `issue_documents`, `adjustment_documents` |
| **Legacy thực tế** | (1) `transactions` trực tiếp trên UI Biến động (2) `export_slips` / `import_slips` |
| **Current behavior** | IN/OUT/ADJUST tạo ngay qua form; phiếu multi-line complete → nhiều TX |
| **Options** | (A) Map slips → issue/receipt tables + giữ manual movements (B) Chỉ `stock_movements` + slips, không document types riêng |
| **Recommended** | **B** — đặt tên `export_slips`/`import_slips` giữ nguyên semantics legacy; manual = `document_type MANUAL` |

---

## ISSUE-003: Status DRAFT / POSTED / CANCELLED vs PROCESSING / COMPLETED / RETURNED

| | |
|---|---|
| **Template** | POST document, CANCEL reverses |
| **Legacy slips** | `PROCESSING` → `complete` → `COMPLETED` → `returnSlip` → `RETURNED` |
| **Legacy transactions** | Không status; không cancel — chỉ thêm TX ngược qua return slip |
| **Risk** | Đổi tên status làm sai UI/UX và regression |
| **Recommended** | Giữ enum legacy cho slips; backend method `Complete`/`Return` not `Post`/`Cancel` |

---

## ISSUE-004: Không có stock ledger before/after

| | |
|---|---|
| **Template** | `quantity_before`, `quantity_change`, `quantity_after` |
| **Legacy** | Chỉ lưu type + quantity; stock trên product |
| **Migration** | Historical rows: `before/after` = NULL hoặc **recompute** khi import theo thứ tự `id` |
| **Recommended** | Recompute on import cho audit; TX mới bắt buộc fill before/after |

---

## ISSUE-005: product.category lưu tên, không FK

| | |
|---|---|
| **Legacy** | String name; đổi tên category sync products |
| **Risk** | Orphan name nếu product trỏ công ty không còn trong master |
| **Migration** | Match `categories.name`; unmatched → `MIGRATION-ISSUES` row + tạo category auto (logic `ensureCategories` trong storage.js) |
| **Recommended** | Import auto-create missing categories từ product.category (giống legacy migration) |

---

## ISSUE-006: Transaction IDs referenced from slips

| | |
|---|---|
| **Legacy** | `outTransactionIds`, `inTransactionIds`, `returnTransactionIds` arrays |
| **Risk** | Broken FK nếu TX import sau slips |
| **Recommended** | Import order: categories → products → **transactions** → slips → patch document_id on movements |

---

## ISSUE-007: Không có Authentication

| | |
|---|---|
| **Legacy** | Single user, no login |
| **Online requirement** | JWT + RBAC for 5 users |
| **Recommended** | NEW tables; `created_by` NULL cho historical data; không gán retroactive user |

---

## ISSUE-008: IndexedDB không phải relational stores

| | |
|---|---|
| **Template scan** | `createObjectStore`, `createIndex` per entity |
| **Thực tế** | Một store `kv`, 5 JSON blobs |
| **Impact** | Migration source = **export JSON**, không đọc IDB schema trực tiếp từ browser tool |

---

## ISSUE-009: ADJUST quantity sign trong báo cáo

| | |
|---|---|
| **Legacy** | `adjustQty` cộng algebraically; ADJUST có thể quantity âm trong TX |
| **Verify** | Báo cáo cuối kỳ phải khớp từng product sau import |
| **Recommended** | Giữ công thức `report.service.js` verbatim trong backend query |

---

## ISSUE-010: README outdated

| | |
|---|---|
| **File** | `inventory/README.md` vẫn ghi "localStorage" |
| **Thực tế** | IndexedDB + cache (`storage.js`) |
| **Action** | Cập nhật README legacy (không blocker migration) |

---

## ISSUE-011: Prompt template API vs actual screens

Template liệt kê `/api/receipts`, `/api/issues`.  
Legacy UI: **Phiếu nhập kho**, **Phiếu xuất kho**, **Biến động tồn kho**.

**Recommended API naming:**

- `/api/import-slips` (not receipts)
- `/api/export-slips` (not issues)
- `/api/transactions` (manual IN/OUT/ADJUST)

---

## Decisions — RESOLVED (schema đơn giản)

| ID | Decision |
|----|----------|
| ISSUE-001 | ✅ **Không** dùng warehouse — single implicit kho, `stock` trên `products` |
| ISSUE-003 | ✅ Giữ status `PROCESSING` / `COMPLETED` / `RETURNED` |
| ISSUE-009 | ✅ `bigserial` PK + `legacy_id` UNIQUE |
| ISSUE-002 | ✅ Slips + `transactions` — items JSONB embedded, không bảng dòng riêng |
| ISSUE-011 | ✅ API: `/api/export-slips`, `/api/import-slips`, `/api/transactions` |
| Auth | ✅ Chỉ bảng `users` — login JWT, **không RBAC** |

---

## Next step

**PHASE 2** — Scaffold ASP.NET Core backend.
