import { Kysely, PostgresDialect, type Generated } from "kysely";
import pg from "pg";
import type { Env } from "../config/env.js";

const { Pool } = pg;

export interface HostsTable {
  id: Generated<string>;
  email: string;
  display_name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SpotifyTokensTable {
  host_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: Date;
  spotify_user_id: string;
  updated_at: Generated<Date>;
}

export interface Database {
  hosts: HostsTable;
  spotify_tokens: SpotifyTokensTable;
}

export function createDb(env: Env): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: env.DATABASE_URL,
        max: 10,
      }),
    }),
  });
}
