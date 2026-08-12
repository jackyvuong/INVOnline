/**
 * Run SQL migrations + seeds against PostgreSQL (no psql required).
 * Usage: node run-migrations.js
 * Env: DATABASE_URL=postgresql://...
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const root = __dirname;

async function runFiles(client, pattern, label) {
  const dir = path.join(root, pattern.includes('migrations') ? 'migrations' : 'seeds');
  const prefix = pattern.includes('migrations') ? 'V' : 'S';
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    process.stdout.write(`${label} ${file}... `);
    await client.query(sql);
    console.log('OK');
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL\n');
    await runFiles(client, 'migrations', 'Applying');
    console.log('');
    await runFiles(client, 'seeds', 'Seeding');
    console.log('\nVerifying schema_migrations:');
    const { rows } = await client.query(
      'SELECT version, name FROM schema_migrations ORDER BY version'
    );
    console.table(rows);
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log('\nTables:', tables.rows.map((r) => r.table_name).join(', '));
  } catch (err) {
    console.error('\nFAILED:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
