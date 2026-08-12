'use strict';

const { Client } = require('pg');

const email = 'vuong0779@gmail.com';

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const existing = await c.query(
    'SELECT id, email, display_name FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );

  if (existing.rows.length > 0) {
    await c.query(
      `UPDATE users SET display_name = 'Admin', is_active = true, updated_at = NOW()
       WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    console.log('Updated admin:', existing.rows[0]);
  } else {
    const r = await c.query(
      `INSERT INTO users (google_sub, email, display_name, is_active)
       VALUES ($1, $1, 'Admin', true)
       RETURNING id, email, display_name`,
      [email]
    );
    console.log('Created admin:', r.rows[0]);
  }

  await c.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
