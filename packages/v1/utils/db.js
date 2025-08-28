const { Client } = require('pg');

// Database configuration from environment variables
// Note: DigitalOcean Functions automatically loads environment variables
const dbConfig = {
    user: process.env.DB_USER || 'doadmin',
    password: process.env.DB_PASSWORD || 'AVNS_uRjTRBh5sSzvEo_8k20',
    host: process.env.DB_HOST || 'victor-pg-do-user-15219341-0.h.db.ondigitalocean.com',
    port: process.env.DB_PORT || 25060,
    database: process.env.DB_NAME || 'property-stewards-db',
    ssl: {
        rejectUnauthorized: false
    }
};

async function getDbClient() {
    const client = new Client(dbConfig);
    await client.connect();
    return client;
}

module.exports = { getDbClient };