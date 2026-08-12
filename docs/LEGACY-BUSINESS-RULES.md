# LEGACY Business Rules — QuanLyTonKho

> **Nguồn:** `inventory/assets/js/*.service.js`, `validation.js`, `.cursor/rules/inventory-business.mdc`  
> **Mục tiêu migration:** backend mới phải cho **kết quả nghiệp vụ tương đương**, trừ thay đổi bắt buộc cho multi-user.

---

## 1. Nguyên tắc vàng (bắt buộc giữ)

| # | Rule | File |
|---|---|---|
| 1 | **Stock không sửa tay** — chỉ đổi khi tạo transaction | `product.service.js`, `transaction.service.js` |
| 2 | **Không sửa / không xóa** transaction | `transaction.service.js` update/remove |
| 3 | **Không cho tồn âm** | validate + create |
| 4 | **ID** = số nguyên tự tăng (`nextId`) | `utils.js` |
| 5 | Muốn chỉnh sai → tạo **ADJUST**, không sửa TX cũ | UI message |

---

## 2. Tính tồn (Source of Truth legacy)

### 2.1 Tồn hiện tại (`product.stock`)

- Lưu **denormalized** trên Product.
- Cập nhật **duy nhất** qua `ProductService._setStock()` — chỉ gọi từ `TransactionService.create()`.
- Tạo product mới: `stock = 0`.

### 2.2 Công thức từ transaction

Khi `TransactionService.create()`:

| Type | Điều kiện quantity | Cập nhật stock |
|---|---|---|
| `IN` | integer > 0 | `stock += qty` |
| `OUT` | integer > 0, `stock >= qty` | `stock -= qty` |
| `ADJUST` | integer ≠ 0 | `stock += qty` (qty âm được); `stock >= 0` sau cùng |

**Delta cho báo cáo** (`report.service.js` → `stockDelta()`):

```text
IN:      +quantity
OUT:     -quantity
ADJUST:  +quantity   (quantity có thể âm)
```

### 2.3 Báo cáo theo kỳ `[fromDate, toDate]` (YYYY-MM-DD)

```text
Đầu kỳ   = Σ stockDelta(tx) với tx.date < fromDate
Nhập     = Σ IN.quantity trong kỳ
Xuất     = Σ OUT.quantity trong kỳ
Điều chỉnh = Σ ADJUST.quantity trong kỳ (cộng algebraically)
Cuối kỳ  = Đầu kỳ + Nhập - Xuất + Điều chỉnh
```

**Lưu ý:** Cột "Xuất" / "Điều chỉnh" hiển thị **số dương** (qty), công thức cuối kỳ trừ xuất.

**Verify migration:** `product.stock` (legacy) phải bằng Σ `stockDelta(all transactions for product)`.

---

## 3. Trạng thái tồn (UI)

| Code | Điều kiện | Label |
|---|---|---|
| `OUT` | stock ≤ 0 | Hết hàng |
| `LOW` | 0 < stock ≤ warningStock | Sắp hết |
| `OK` | còn lại | Đủ hàng |

Hàm: `getStockStatus(product)` — `product.service.js`.

---

## 4. Category (Công Ty)

| Rule | Chi tiết |
|---|---|
| CRUD | `category.service.js` |
| Unique | `code`, `name` (case-insensitive) |
| Xóa | Chỉ khi **0** sản phẩm có `product.category === name` |
| Đổi tên | Cập nhật **tất cả** `product.category` từ tên cũ → tên mới |
| Product link | Lưu **tên** (`category` string), không lưu `categoryId` |

Form product: `category` phải nằm trong master (trừ sản phẩm đang sửa với tên cũ chưa khai báo).

---

## 5. Product

| Rule | Chi tiết |
|---|---|
| Unique | `code` only (name không check trùng) |
| Xóa | Chỉ khi **không có** transaction với `productId` |
| Update | **Không đổi** `stock` qua form update |
| Filter | search, category (công ty), status (OK/LOW/OUT) |
| Export CSV | Theo filter hiện tại — `products.page.js` |

---

## 6. Transaction (Biến động tồn kho)

| Rule | Chi tiết |
|---|---|
| Create | Validate → update stock → append transaction |
| Update | **Blocked** |
| Delete | **Blocked** |
| Filter | search, type, productId, category (companyName enriched), dateFrom, dateTo |
| Enriched fields | productCode, productName, companyName, productBrand, productUnit |

Thứ tự ghi legacy: **stock trước**, rồi push transaction (không rollback tự động nếu save TX fail sau setStock — single-threaded browser).

---

## 7. Export Slip (Phiếu xuất kho)

### 7.1 Status lifecycle

```text
PROCESSING ──complete()──> COMPLETED ──returnSlip()──> RETURNED
     |                           |
  edit/delete/copy            view only (+ return nếu COMPLETED)
```

| Status | Label | Stock impact |
|---|---|---|
| `PROCESSING` | Đang xử lý | Chưa |
| `COMPLETED` | Hoàn thành | Đã trừ (OUT) |
| `RETURNED` | Hoàn trả | Đã cộng lại (IN) |

**Không có:** `DRAFT`, `POSTED`, `CANCELLED`, edit sau COMPLETED.

### 7.2 complete(id)

1. Chỉ `PROCESSING`
2. `checkStockForItems` — đủ tồn từng dòng
3. Với mỗi item: `TransactionService.create({ type: OUT, ... })`
4. Note TX: `Xuất theo phiếu {code} - {recipient} - {item.note}`
5. Lưu `outTransactionIds`, status → `COMPLETED`

### 7.3 returnSlip(id)

1. Chỉ `COMPLETED`
2. Với mỗi item: `TransactionService.create({ type: IN, ... })`
3. Note: `Hoàn trả phiếu {code} - ...`
4. status → `RETURNED`

### 7.4 Khác

- Code: `PXK-YYYYMMDD-NNN`
- Items: không trùng productId trên cùng phiếu
- Copy → phiếu mới PROCESSING
- Remove → chỉ PROCESSING
- CSV export từng phiếu

---

## 8. Import Slip (Phiếu nhập kho)

Logic **đảo** so với export:

| Action | Transaction | Stock |
|---|---|---|
| `complete()` | IN | Cộng |
| `returnSlip()` | OUT (+ check tồn) | Trừ |

Code: `PNK-YYYYMMDD-NNN`  
Field: `supplier` thay `recipient`  
IDs: `inTransactionIds`

Validation: dùng chung `validateExportSlipForm` (items + date).

---

## 9. Không có trong legacy (quan trọng cho backend mới)

| Concept prompt template | Legacy thực tế |
|---|---|
| Warehouses | **Không** — single implicit warehouse |
| Receipt / Issue / Adjustment **documents** | **Không** — chỉ `transactions` trực tiếp + phiếu nhập/xuất |
| POST / CANCEL document | **Không** — phiếu dùng complete/return |
| stock_transactions ledger | **Không** — chỉ `transactions[]` |
| quantity_before / quantity_after | **Không** |
| Authentication / RBAC | **Không** |
| Audit log | **Không** |

---

## 10. UI / UX cần giữ (React migration)

### Menu (`constants.js` NAV_ITEMS)

1. Dashboard  
2. Công Ty  
3. Quản lý sản phẩm  
4. Biến động tồn kho  
5. Phiếu xuất kho  
6. Phiếu nhập kho  
7. Tồn hiện tại  
8. Báo cáo tồn kho  
9. Cài đặt  

### Patterns UI

- Toast (không `alert()`)
- Modal + confirm 2 bước (xóa, hoàn thành phiếu, reset)
- Field errors `[data-error-for]`
- Bảng: sticky header, sort, filter realtime, pagination (`table.js`)
- Select autocomplete sản phẩm / công ty
- Export CSV: products, categories, stock, report, slips

### Settings (online migration)

Legacy: Export/Import JSON, Reset, Backup tự động (File System API).  
Online: thay bằng server backup; giữ **import legacy JSON** một lần qua migration tool.

---

## 11. Concurrency (legacy vs online)

**Legacy:** một browser, một cache — không race.

**Online (mới):** 5 users → bắt buộc:

- PostgreSQL transaction + `SELECT ... FOR UPDATE` trên inventory row
- Post phiếu nhiều dòng = **một** DB transaction (all-or-nothing)
- Không cho 2 OUT đồng thời vượt tồn

**Regression:** kết quả stock cuối phải giống legacy với cùng chuỗi thao tác tuần tự.

---

## 12. Legacy behavior → Backend mapping (tóm tắt)

| Legacy action | Backend use case đề xuất |
|---|---|
| Product CRUD | `CreateProduct`, `UpdateProduct`, `DeleteProduct` |
| Category CRUD | `CreateCategory`, `UpdateCategory` (+ sync product names) |
| Transaction create | `CreateStockMovement` (immutable) |
| Export slip complete | `CompleteExportSlip` → N × OUT in 1 TX |
| Export slip return | `ReturnExportSlip` → N × IN in 1 TX |
| Import slip complete | `CompleteImportSlip` → N × IN |
| Import slip return | `ReturnImportSlip` → N × OUT |
| Report | `GetStockPeriodReport` |
| Dashboard stats | `GetDashboardStats` |

---

## 13. Regression test scenarios (từ legacy)

1. Tạo SP → stock 0 → IN 100 → stock 100  
2. OUT 30 → stock 70; OUT 80 → **fail**  
3. ADJUST -5 → stock 65; ADJUST làm âm → **fail**  
4. Phiếu xuất complete → OUT; return → IN; stock về ban đầu  
5. Phiếu nhập complete → IN; return → OUT (check tồn)  
6. Báo cáo kỳ: cuối kỳ = đầu kỳ + nhập - xuất + điều chỉnh  
7. Xóa SP có TX → fail; xóa category có SP → fail  
8. Đổi tên category → product.category cập nhật  

---

## 14. File tham chiếu logic

| File | Vai trò |
|---|---|
| `transaction.service.js` | Core stock |
| `product.service.js` | Product + `_setStock` |
| `export-slip.service.js` | Phiếu xuất |
| `import-slip.service.js` | Phiếu nhập |
| `report.service.js` | Báo cáo kỳ |
| `category.service.js` | Công ty |
| `validation.js` | Form rules |
| `storage.js` | Persistence |
