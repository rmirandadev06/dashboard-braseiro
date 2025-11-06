// /backend/db.js

const knex = require('knex');
// 1. Importe o 'parse' para "ler" a string de conexão
const { parse } = require('pg-connection-string');

// 2. Pegue a string de conexão (do Render ou do seu fallback local)
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Prj@2025@db.otdtqyleaxeqawwgjwkl.supabase.co:5432/postgres';

// 3. Converta a string em um objeto de configuração
const connectionConfig = parse(connectionString);

// 4. (ESTA É A CORREÇÃO) Force o Node.js a usar IPv4
connectionConfig.family = 4;

const dbConfig = {
  client: 'pg',
  // 5. Use o objeto de configuração corrigido
  connection: connectionConfig,
  ssl: { rejectUnauthorized: false } //
};

const connection = knex(dbConfig);

module.exports = connection;