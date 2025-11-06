// /backend/db.js

const knex = require('knex');

// 1. COLE A SUA "CONNECTION STRING" (URI) DO SUPABASE AQUI:
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Prj@2025@db.otdtqyleaxeqawwgjwkl.supabase.co:5432/postgres';

const dbConfig = {
  client: 'pg',
  connection: connectionString,

  // 2. ADICIONE ESTA LINHA:
  // Isso é necessário para conexões em nuvem (SSL)
  ssl: { rejectUnauthorized: false }
};

const connection = knex(dbConfig);

module.exports = connection;