const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// 1. Setup Connection
// We use the environment variable 'DATABASE_URL' for security when deployed
const isProduction = process.env.NODE_ENV === 'production';

// PASTE YOUR NEON CONNECTION STRING HERE FOR LOCAL TESTING
// BUT DO NOT UPLOAD THIS FILE WITH THE PASSWORD TO GITHUB IF PUBLIC
const localConnectionString = 'postgres://...PASTE_YOUR_NEON_STRING_HERE...';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || localConnectionString,
    ssl: { rejectUnauthorized: false } // Required for Neon/Render
});

console.log('🔄 Connecting to PostgreSQL...');

// 2. Initialize Tables (Async)
const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                avatar_color TEXT DEFAULT '#007bff',
                isAdmin BOOLEAN DEFAULT FALSE
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS groups (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                avatar_color TEXT DEFAULT '#ff5252'
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER,
                group_id INTEGER,
                receiver_id INTEGER,
                content TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'sent',
                FOREIGN KEY(sender_id) REFERENCES users(id)
            );
        `);

        // Create Default Admin
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync('admin123', salt);
        
        // "ON CONFLICT DO NOTHING" prevents errors if Admin exists
        await pool.query(`
            INSERT INTO users (username, password, avatar_color, isAdmin) 
            VALUES ($1, $2, $3, $4) 
            ON CONFLICT (username) DO NOTHING
        `, ['Admin', hash, '#7289da', true]);

        console.log('✅ PostgreSQL Database Ready.');
    } catch (err) {
        console.error('❌ Database Setup Error:', err);
    }
};

initDb();

module.exports = pool;