import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Kysely, Migrator, PostgresDialect } from "kysely";
import type { MigrationProvider, Migration } from "kysely";
import pg from "pg";
import { loadEnv } from "../config/env.js";
import { readdirSync } from "node:fs";

const { Pool } = pg;

/** Custom provider that converts Windows paths to file:// URLs for dynamic import */
class SafeFileMigrationProvider implements MigrationProvider {
  constructor(private folder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const migrations: Record<string, Migration> = {};
    const files = readdirSync(this.folder).sort();

    for (const file of files) {
      if (!file.endsWith(".ts") && !file.endsWith(".js")) continue;
      const filePath = path.join(this.folder, file);
      const fileUrl = pathToFileURL(filePath).href;
      const migration = await import(fileUrl);
      const name = file.replace(/\.[^.]+$/, "");
      migrations[name] = migration;
    }

    return migrations;
  }
}

async function migrate() {
  const env = loadEnv();

  const db = new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: env.DATABASE_URL }),
    }),
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  const migrator = new Migrator({
    db,
    provider: new SafeFileMigrationProvider(
      path.join(__dirname, "migrations"),
    ),
  });

  console.log("Running migrations...");
  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`  ✓ ${it.migrationName}`);
    } else if (it.status === "Error") {
      console.error(`  ✗ ${it.migrationName}`);
    }
  });

  if (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }

  console.log("Migrations complete.");
  await db.destroy();
}

migrate();
