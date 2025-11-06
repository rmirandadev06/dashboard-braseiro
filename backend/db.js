const knex = require('knex');

// ▼▼▼ COLE A NOVA STRING (COM PORTA 6543) AQUI ▼▼▼
const NOVA_STRING_DO_POOLER = 'postgresql://postgres.otdtqyleaxeqawwgjwkl:Prj@2025@aws-1-sa-east-1.pooler.supabase.com:6543/postgres';

const connectionString = process.env.DATABASE_URL || NOVA_STRING_DO_POOLER;

const dbConfig = {
  client: 'pg',
  connection: connectionString,
  ssl: { rejectUnauthorized: false }
};

const connection = knex(dbConfig);
module.exports = connection;