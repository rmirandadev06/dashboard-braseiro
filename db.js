// /backend/db.js
const knex = require('knex'); //

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('Erro fatal: DATABASE_URL não foi definida nas variáveis de ambiente.');
}

const dbConfig = {
  client: 'pg', //
  connection: connectionString,
  ssl: { rejectUnauthorized: false } //
};

const connection = knex(dbConfig); //
module.exports = connection; //