import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Read the CA certificate for SSL connection
const caCertPath = path.join(process.cwd(), 'ca-certificate.crt');
const caCert = fs.readFileSync(caCertPath, 'utf8');

// Database configuration
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '25060'),
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: true,
    ca: caCert,
  },
  // Connection pool settings
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased to 10 seconds
  query_timeout: 15000, // 15 second query timeout
  keepAlive: true,
};

// Create a connection pool
const pool = new Pool(dbConfig);

// Handle pool errors
pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

export { pool };

// Database query helper function
export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Get a client from the pool for transactions
export async function getClient() {
  return await pool.connect();
}

// Test database connection
export async function testConnection() {
  try {
    const result = await query('SELECT NOW() as current_time');
    console.log('Database connected successfully:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}