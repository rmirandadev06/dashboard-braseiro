require('dotenv').config();
const knex = require('knex');

const db = knex({
    client: 'pg',
    connection: {
        connectionString: process.env.DATABASE_URL,
        // ESTAS TRÊS LINHAS SÃO OBRIGATÓRIAS PRO SUPABASE:
        ssl: { 
            rejectUnauthorized: false 
        } 
    }
});

module.exports = db;