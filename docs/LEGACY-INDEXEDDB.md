# LEGACY IndexedDB & Browser Storage — QuanLyTonKho

> **Nguồn:** scan repository `inventory/` — PHASE 0 Discovery  
> **Ngày:** 2026-08-12  
> **Không suy đoán:** mọi tên key/entity lấy từ `storage.js`, `constants.js`, `*.service.js`.

---

## 1. Tổng quan kiến trúc lưu trữ

```text
Browser
   |
   v
HTML + Vanilla JS (window.QLTK)
   |
   v
storage.js
   |
   +-- IndexedDB (chính): database qltk_app_data
   |       object store: kv  (key-value, KHÔNG phải relational stores)
   |
   +-- RAM cache (sync API sau Storage.init())
   |
   +-- localStorage (fallback + settings + migration backup)
   |
   +-- IndexedDB phụ (backup.service.js): qltk_backup_fs
           lưu FileSystemDirectoryHandle — KHÔNG phải business data
```

**Không có:** `warehouses`, `receipts`/`issues`/`adjustments` dạng document riêng, `inventory` store, authentication.

---

## 2. IndexedDB — Business data

### 2.1 Database chính

| Thuộc tính | Giá trị (từ `storage.js`) |
|---|---|
| `IDB_NAME` | `qltk_app_data` |
| `IDB_VERSION` | `1` |
| `IDB_STORE` | `kv` (single object store, **không có index**) |
| Primary key | String key (tên constant), value = JSON blob |

### 2.2 Keys trong object store `kv`

| Key (STORAGE_KEYS) | Giá trị lưu | Kiểu value |
|---|---|---|
| `qltk_products` | Mảng Product | `object[]` |
| `qltk_transactions` | Mảng Transaction | `object[]` |
| `qltk_categories` | Mảng Category (UI: **Công Ty**) | `object[]` |
| `qltk_export_slips` | Mảng Export Slip (Phiếu xuất) | `object[]` |
| `qltk_import_slips` | Mảng Import Slip (Phiếu nhập) | `object[]` |
| `qltk_initialized` | Cờ init | `'1'` hoặc string |

**Lưu ý:** Toàn bộ entity nằm trong **5 mảng JSON** lớn, không có `createIndex()` / `openCursor()` trên từng entity.

### 2.3 RAM cache (mirror sau init)

```javascript
cache = {
  products: [],
  transactions: [],
  categories: [],
  exportSlips: [],
  importSlips: [],
  initialized: '',
}
```

Mọi `Storage.get*()` → `clone()` mảng → service filter/sort **in-memory**.

### 2.4 Backend mode

| Mode | Điều kiện |
|---|---|
| `idb` | IndexedDB khả dụng, đã migrate |
| `localStorage` | Fallback nếu IDB lỗi |
| `memory` | Trước init |

Flag: `qltk_idb_ready` trong localStorage.

---

## 3. localStorage (không phải IndexedDB)

| Key | Nội dung | Business? |
|---|---|---|
| `qltk_products` | Backup/migrate từ thời localStorage-only | Có (bản sao) |
| `qltk_transactions` | idem | Có |
| `qltk_categories` | idem | Có |
| `qltk_export_slips` | idem | Có |
| `qltk_import_slips` | idem | Có |
| `qltk_initialized` | `'1'` | Meta |
| `qltk_settings` | Cấu hình backup tự động | **Không** (settings) |
| `qltk_idb_ready` | Flag migrate IDB | Meta |

**Không dùng** `sessionStorage`.

---

## 4. IndexedDB phụ — Backup FS handle

| Thuộc tính | Giá trị |
|---|---|
| `IDB_NAME` | `qltk_backup_fs` |
| Store | `handles` |
| Key | `databaseDir` → `FileSystemDirectoryHandle` |

Dùng cho File System Access API (thư mục `inventory/Database/`). File JSON backup **không** nằm trong IndexedDB business DB.

---

## 5. Entity schemas (từ code thực tế)

### 5.1 Category (`categories[]`) — UI: **Công Ty**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | number (integer) | ✓ | Auto `nextId()` |
| `code` | string | ✓ | Unique (case-insensitive trim) |
| `name` | string | ✓ | Unique; sync sang `product.category` khi đổi tên |
| `description` | string | | |
| `createdAt` | string | ✓ | `YYYY-MM-DD HH:mm` local |
| `updatedAt` | string | ✓ | |

**Quan hệ:** Product lưu `category` = **tên công ty** (string), **không phải** `category.id`.

### 5.2 Product (`products[]`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | number | ✓ | |
| `code` | string | ✓ | Unique |
| `name` | string | ✓ | |
| `category` | string | ✓ | Tên công ty (denormalized) |
| `unit` | string | ✓ | |
| `brand` | string | | Hãng |
| `description` | string | | |
| `note` | string | | Tooltip trên bảng |
| `warningStock` | number (int ≥ 0) | ✓ | Ngưỡng cảnh báo |
| `stock` | number (int ≥ 0) | ✓ | **Denormalized** — chỉ đổi qua Transaction |
| `createdAt` | string | ✓ | |
| `updatedAt` | string | ✓ | |

Tạo mới: `stock = 0`.

### 5.3 Transaction (`transactions[]`) — Biến động tồn kho

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | number | ✓ | |
| `date` | string | ✓ | `YYYY-MM-DD HH:mm` |
| `productId` | number | ✓ | FK → products.id |
| `type` | enum | ✓ | `IN` \| `OUT` \| `ADJUST` |
| `quantity` | number (int) | ✓ | IN/OUT: > 0; ADJUST: ≠ 0 (có thể âm) |
| `note` | string | | |

**Immutable:** không sửa, không xóa (`transaction.service.js`).

**Không có:** `warehouse_id`, `created_by`, `document_id`, `quantity_before/after`.

### 5.4 Export Slip (`exportSlips[]`) — Phiếu xuất kho

| Field | Type | Notes |
|---|---|---|
| `id` | number | |
| `code` | string | `PXK-YYYYMMDD-NNN` |
| `date` | string | |
| `recipient` | string | Người nhận / nơi nhận |
| `note` | string | |
| `status` | enum | `PROCESSING` \| `COMPLETED` \| `RETURNED` |
| `items` | array | `{ productId, quantity, note }[]` embedded |
| `outTransactionIds` | number[] | IDs transaction OUT khi complete |
| `returnTransactionIds` | number[] | IDs transaction IN khi return |
| `createdAt` | string | |
| `updatedAt` | string | |

### 5.5 Import Slip (`importSlips[]`) — Phiếu nhập kho

Giống export slip, khác:

| Field | Khác biệt |
|---|---|
| `code` | `PNK-YYYYMMDD-NNN` |
| `supplier` | thay `recipient` |
| `inTransactionIds` | thay `outTransactionIds` |

---

## 6. ID generation

```javascript
nextId(items) = max(items[].id) + 1  // integer, không UUID
```

Per-entity sequence độc lập (products, transactions, slips each own max id).

---

## 7. Export / Import JSON (migration source)

### 7.1 `Storage.exportAll()` — Cài đặt → Export

```json
{
  "version": "1.0.0",
  "exportedAt": "2026-08-11T13:16:29.309Z",
  "products": [ ... ],
  "transactions": [ ... ],
  "categories": [ ... ],
  "exportSlips": [ ... ],
  "importSlips": [ ... ]
}
```

### 7.2 Backup tự động

Cùng schema, thêm `appVersion`, `backupType: "auto"` (`backup.service.js`).

Ví dụ production backup: `inventory/Database/latest.json` (~0.5 MB):

| Entity | Count (mẫu latest.json) |
|---|---|
| products | 949 |
| transactions | 1000 |
| categories | 41 |
| exportSlips | 24 |
| importSlips | 14 |

### 7.3 Import

`Storage.importAll(payload)` — ghi đè toàn bộ 5 mảng; yêu cầu `products` + `transactions` arrays.

---

## 8. Seed data

| File | Fallback |
|---|---|
| `assets/data/products.json` | `seed-data.js` → `SEED_PRODUCTS` |
| `assets/data/transactions.json` | `SEED_TRANSACTIONS` |
| `assets/data/categories.json` | `SEED_CATEGORIES` |
| `assets/data/export-slips.json` | `[]` |
| `assets/data/import-slips.json` | `[]` |

---

## 9. Sơ đồ quan hệ logic (legacy)

```text
categories (master: Công Ty)
     |
     | name copied into
     v
products ──stock (denormalized)──┐
     ^                            |
     |                            | _setStock()
     |                            |
transactions (IN/OUT/ADJUST) ─────┘

export_slips.items[] ──complete──> transactions (OUT)
                   └──return───> transactions (IN)

import_slips.items[] ──complete──> transactions (IN)
                   └──return───> transactions (OUT)
```

**Single warehouse implicit** — không có entity kho.

---

## 10. UI pages → data touched

| Page | File | Services |
|---|---|---|
| Dashboard | `index.html` | ProductService, TransactionService |
| Công Ty | `categories.html` | CategoryService |
| Quản lý sản phẩm | `products.html` | ProductService, CategoryService |
| Biến động tồn kho | `transactions.html` | TransactionService |
| Phiếu xuất kho | `export-slips.html` | ExportSlipService |
| Phiếu nhập kho | `import-slips.html` | ImportSlipService |
| Tồn hiện tại | `stock.html` | ProductService |
| Báo cáo tồn kho | `report.html` | ReportService |
| Cài đặt | `settings.html` | Storage, BackupService |

---

## 11. Authentication

**Không có** login, JWT, session, user — single-user implicit.

---

## 12. Implications cho migration

1. Export path sẵn có: **tận dụng** `Storage.exportAll()` / `latest.json`.
2. Normalize `export_slips.items` / `import_slips.items` → bảng con PostgreSQL.
3. `product.category` string → cần map sang `category_id` hoặc giữ denormalized + FK validation.
4. Thêm `stock_transactions` ledger là **bổ sung** — legacy không có before/after.
5. Không map 1:1 `receipts`/`issues`/`adjustments` document — xem `MIGRATION-ISSUES.md`.
