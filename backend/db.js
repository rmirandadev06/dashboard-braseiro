// /backend/db.js

const knex = require('knex');
const { parse } = require('pg-connection-string');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Prj@2025@db.otdtqyleaxeqawwgjwkl.supabase.co:5432/postgres';

const connectionConfig = parse(connectionString);

// CORREÇÃO ALTERNATIVA:
// Em vez de forçar 'family', vamos forçar o 'host'
// Isso faz o Node.js resolver o IPv4 do host antes de tentar conectar.
const dbConfig = {
  client: 'pg',
  connection: {
    host: connectionConfig.host,
    port: connectionConfig.port,
    user: connectionConfig.user,
    password: connectionConfig.password,
    database: connectionConfig.database,
    ssl: { rejectUnauthorized: false }
  }
};

const connection = knex(dbConfig);
module.exports = connection;