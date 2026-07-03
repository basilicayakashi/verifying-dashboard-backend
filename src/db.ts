import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const connectionString = process.env.CONNECTIONSTRING_SQL;

if (!connectionString) {
  throw new Error("CONNECTIONSTRING_SQL est manquant dans le .env");
}

export const db = new Pool({
  connectionString,
});