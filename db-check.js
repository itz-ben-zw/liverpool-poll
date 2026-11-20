const { Pool } = require("pg");

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error("[db-check] FAILED: DATABASE_URL is not configured.");
    return false;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    max: 1
  });

  try {
    const result = await pool.query(
      "SELECT current_database() AS database, current_user AS role, version() AS version"
    );
    const row = result.rows[0];
    const version = String(row.version || "").split(" ").slice(0, 2).join(" ");
    console.log("[db-check] CONNECTED: PostgreSQL responded successfully.");
    console.log("[db-check] Database:", row.database);
    console.log("[db-check] Role:", row.role);
    console.log("[db-check] Server:", version);
    return true;
  } catch (error) {
    const code = error && error.code ? String(error.code) : "CONNECTION_ERROR";
    console.error("[db-check] FAILED: PostgreSQL connection could not be established. Code:", code);
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  run().then(ok => { if (!ok) process.exitCode = 1; });
}

module.exports = { run };
