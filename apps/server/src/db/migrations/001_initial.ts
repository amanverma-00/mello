import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`.execute(db);

  await db.schema
    .createTable("hosts")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("email", "text", (col) => col.unique().notNull())
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("spotify_tokens")
    .addColumn("host_id", "uuid", (col) =>
      col.primaryKey().references("hosts.id").onDelete("cascade"),
    )
    .addColumn("access_token", "text", (col) => col.notNull())
    .addColumn("refresh_token", "text", (col) => col.notNull())
    .addColumn("token_expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("spotify_user_id", "text", (col) => col.notNull())
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("spotify_tokens").ifExists().execute();
  await db.schema.dropTable("hosts").ifExists().execute();
}
