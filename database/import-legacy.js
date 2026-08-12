'use strict';

/**
 * Import dữ liệu legacy (Storage.exportAll / latest.json) vào PostgreSQL.
 *
 * Usage:
 *   $env:DATABASE_URL = "postgresql://..."
 *   node import-legacy.js --file ../inventory/Database/latest.json
 *   node import-legacy.js --file backup.json --dry-run
 *   node import-legacy.js --file backup.json --email admin@example.com
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function parseArgs(argv) {
  const args = { file: null, dryRun: false, email: 'legacy-import@system' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) args.file = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--email' && argv[i + 1]) args.email = argv[++i];
  }
  return args;
}

function parseLegacyDate(value) {
  if (!value) return new Date();
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return new Date();
}

function ensureCategories(categories, products) {
  const list = Array.isArray(categories) ? [...categories.filter((c) => c && c.id && c.name)] : [];
  const names = new Set(list.map((c) => String(c.name).trim().toLowerCase()));
  let maxId = list.reduce((m, c) => Math.max(m, c.id || 0), 0);
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

  for (const p of products || []) {
    const name = String(p.category || '').trim();
    if (!name || names.has(name.toLowerCase())) continue;
    maxId += 1;
    list.push({
      id: maxId,
      code: `NH${String(maxId).padStart(2, '0')}`,
      name,
      description: 'Tự động tạo từ dữ liệu sản phẩm',
      createdAt: now,
      updatedAt: now,
    });
    names.add(name.toLowerCase());
  }
  return list;
}

function validate(backup) {
  const errors = [];
  if (!Array.isArray(backup.products) || backup.products.length === 0) errors.push('Thiếu products.');
  if (!Array.isArray(backup.transactions)) errors.push('Thiếu transactions.');
  if (errors.length) return errors;

  const productIds = new Set(backup.products.map((p) => p.id));
  for (const t of backup.transactions) {
    if (!productIds.has(t.productId)) errors.push(`Transaction #${t.id}: productId ${t.productId} không tồn tại.`);
  }
  for (const p of backup.products) {
    if (Number(p.stock) < 0) errors.push(`Product #${p.id} (${p.code}): tồn âm.`);
  }
  return errors.slice(0, 10);
}

async function resetSequences(client) {
  for (const table of ['categories', 'products', 'transactions', 'export_slips', 'import_slips']) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`
    );
  }
}

async function importBackup(client, backup, email) {
  await client.query('BEGIN');
  try {
    await client.query('DELETE FROM transactions');
    await client.query('DELETE FROM export_slips');
    await client.query('DELETE FROM import_slips');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM categories');

    for (const c of backup.categories) {
      await client.query(
        `INSERT INTO categories (legacy_id, code, name, description, created_at, updated_at, created_by_email, updated_by_email)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
        [c.id, c.code, c.name, c.description || '', parseLegacyDate(c.createdAt), parseLegacyDate(c.updatedAt), email]
      );
    }

    const prodMap = new Map();
    for (const p of backup.products) {
      const r = await client.query(
        `INSERT INTO products (legacy_id, code, name, category_name, unit, brand, description, note, warning_stock, stock,
          created_at, updated_at, created_by_email, updated_by_email)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING id`,
        [
          p.id, p.code, p.name, p.category || '', p.unit, p.brand || '', p.description || '', p.note || '',
          p.warningStock || 0, p.stock || 0, parseLegacyDate(p.createdAt), parseLegacyDate(p.updatedAt), email,
        ]
      );
      prodMap.set(p.id, r.rows[0].id);
    }

    let skippedTx = 0;
    for (const t of backup.transactions) {
      const productId = prodMap.get(t.productId);
      if (!productId) { skippedTx++; continue; }
      await client.query(
        `INSERT INTO transactions (legacy_id, movement_at, product_id, type, quantity, note, created_by_email)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [t.id, parseLegacyDate(t.date), productId, t.type, t.quantity, t.note || '', email]
      );
    }

    for (const s of backup.exportSlips || []) {
      await client.query(
        `INSERT INTO export_slips (legacy_id, code, slip_date, recipient, note, status, items, out_transaction_ids, return_transaction_ids,
          created_at, updated_at, created_by_email, updated_by_email)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$12)`,
        [
          s.id, s.code, parseLegacyDate(s.date), s.recipient || '', s.note || '', s.status,
          JSON.stringify(s.items || []), JSON.stringify(s.outTransactionIds || []), JSON.stringify(s.returnTransactionIds || []),
          parseLegacyDate(s.createdAt), parseLegacyDate(s.updatedAt), email,
        ]
      );
    }

    for (const s of backup.importSlips || []) {
      await client.query(
        `INSERT INTO import_slips (legacy_id, code, slip_date, supplier, note, status, items, in_transaction_ids, return_transaction_ids,
          created_at, updated_at, created_by_email, updated_by_email)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$12)`,
        [
          s.id, s.code, parseLegacyDate(s.date), s.supplier || '', s.note || '', s.status,
          JSON.stringify(s.items || []), JSON.stringify(s.inTransactionIds || []), JSON.stringify(s.returnTransactionIds || []),
          parseLegacyDate(s.createdAt), parseLegacyDate(s.updatedAt), email,
        ]
      );
    }

    await resetSequences(client);
    await client.query('COMMIT');
    return { skippedTx };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('Usage: node import-legacy.js --file <path-to-json> [--dry-run] [--email user@example.com]');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  const filePath = path.resolve(args.file);
  const raw = fs.readFileSync(filePath, 'utf8');
  const backup = JSON.parse(raw);
  backup.categories = ensureCategories(backup.categories, backup.products);
  backup.exportSlips = backup.exportSlips || [];
  backup.importSlips = backup.importSlips || [];

  const summary = {
    version: backup.version,
    exportedAt: backup.exportedAt,
    categories: backup.categories.length,
    products: backup.products.length,
    transactions: backup.transactions.length,
    exportSlips: backup.exportSlips.length,
    importSlips: backup.importSlips.length,
  };

  console.log('File:', filePath);
  console.log('Summary:', summary);

  const errors = validate(backup);
  if (errors.length) {
    console.error('Validation failed:');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
  }

  if (args.dryRun) {
    console.log('Dry-run OK — no data written.');
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { skippedTx } = await importBackup(client, backup, args.email);
  await client.end();

  console.log('Import OK.', skippedTx ? `Skipped transactions: ${skippedTx}` : '');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
