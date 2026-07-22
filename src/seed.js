require("dotenv").config();
const bcrypt = require("bcrypt");
const { pool } = require("./db");

const DEFAULT_DEPARTMENTS = [
  "Production", "Quality Assurance", "Maintenance", "Logistics & Warehouse",
  "Human Resources", "Administration", "Engineering", "Packaging",
];

async function seed() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in your .env before seeding.");
  }

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, 'admin', $3)`,
      [email, hash, "Site Administrator"]
    );
    console.log(`✅ Created admin user: ${email}`);
  } else {
    console.log(`ℹ️  Admin user ${email} already exists, skipping.`);
  }

  for (const name of DEFAULT_DEPARTMENTS) {
    await pool.query(
      `INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [name]
    );
  }
  console.log(`✅ Seeded ${DEFAULT_DEPARTMENTS.length} default departments.`);

  await pool.query(
    `INSERT INTO site_settings (key, value) VALUES
      ('logo', ''), ('title', 'KAIZEN'), ('tagline', 'Committee Portal'),
      ('footerText', 'Kaizen Committee — 6S, Safety & Continuous Improvement'),
      ('chairpersonName', 'Faith Achieng'), ('chairpersonRole', 'Chairperson, Kaizen Committee'),
      ('chairpersonPhoto', ''), ('chairpersonMessage', 'Kaizen is what we choose to do every shift.'),
      ('patronName', 'Eng. Samuel Kiptoo'), ('patronRole', 'Patron, Kaizen Committee'),
      ('patronPhoto', ''), ('patronMessage', 'Every improvement you drive on the floor gets the visibility it deserves.')
    ON CONFLICT (key) DO NOTHING`
  );
  console.log("✅ Seeded default site settings.");

  await pool.end();
  console.log("\nDone. Log in with the admin email/password from your .env, then change the password immediately.");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
