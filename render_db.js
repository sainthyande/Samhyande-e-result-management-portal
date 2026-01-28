// db.js - PostgreSQL Database Connection for Render
const { Pool } = require('pg');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.dpg-d5su2pnpm1nc73cl7uf0-a,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

// Helper function to execute queries
const query = async (text, params) => {
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
};

// Initialize database tables
const initializeDatabase = async () => {
  try {
    console.log('🔧 Initializing database...');

    // Create tables
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'admin',
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS form_masters (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS class_arms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(10) UNIQUE NOT NULL,
        form_master_id INTEGER REFERENCES form_masters(id) ON DELETE SET NULL,
        password_hash TEXT NOT NULL,
        student_names JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS assessment_config (
        id SERIAL PRIMARY KEY,
        class_name VARCHAR(10) UNIQUE NOT NULL,
        ca1_max INTEGER DEFAULT 10,
        ca2_max INTEGER DEFAULT 10,
        ca3_max INTEGER DEFAULT 10,
        exam_max INTEGER DEFAULT 70,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS school_info (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        address TEXT,
        email VARCHAR(100),
        phone VARCHAR(20),
        session VARCHAR(20),
        principal_name VARCHAR(100),
        principal_comment TEXT,
        logo TEXT,
        principal_signature TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS teacher_signatures (
        id SERIAL PRIMARY KEY,
        subject_name VARCHAR(100) UNIQUE NOT NULL,
        signature_data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        student_name VARCHAR(100) NOT NULL,
        adm_no VARCHAR(50) NOT NULL,
        dob VARCHAR(20),
        age INTEGER,
        sex VARCHAR(10) NOT NULL,
        term VARCHAR(1) NOT NULL,
        class_name VARCHAR(10) NOT NULL,
        total_obtained DECIMAL(10, 2) DEFAULT 0,
        total_obtainable DECIMAL(10, 2) DEFAULT 0,
        average_score DECIMAL(5, 2) DEFAULT 0,
        position INTEGER,
        position_of INTEGER,
        passport TEXT,
        form_master VARCHAR(100),
        form_master_comment TEXT,
        form_master_signature TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(adm_no, term, class_name)
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        subject_name VARCHAR(100) NOT NULL,
        ca1 DECIMAL(5, 2) DEFAULT 0,
        ca2 DECIMAL(5, 2) DEFAULT 0,
        ca3 DECIMAL(5, 2) DEFAULT 0,
        exam DECIMAL(5, 2) DEFAULT 0,
        total DECIMAL(5, 2) DEFAULT 0,
        grade CHAR(1),
        remark VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS affective_ratings (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        domain VARCHAR(100) NOT NULL,
        rating INTEGER CHECK (rating BETWEEN 1 AND 5),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, domain)
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS psychomotor_ratings (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        domain VARCHAR(100) NOT NULL,
        rating INTEGER CHECK (rating BETWEEN 1 AND 5),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(student_id, domain)
      );
    `);

    // Create indexes for better performance
    await query('CREATE INDEX IF NOT EXISTS idx_students_class_term ON students(class_name, term);');
    await query('CREATE INDEX IF NOT EXISTS idx_students_adm_no ON students(adm_no);');
    await query('CREATE INDEX IF NOT EXISTS idx_subjects_student_id ON subjects(student_id);');
    await query('CREATE INDEX IF NOT EXISTS idx_class_arms_name ON class_arms(name);');

    // Insert default admin if not exists
    const adminCheck = await query(`SELECT id FROM users WHERE username = 'admin' LIMIT 1`);
    if (adminCheck.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await query(
        `INSERT INTO users (username, password_hash, role, name, email) VALUES ($1, $2, $3, $4, $5)`,
        ['admin', hashedPassword, 'admin', 'Administrator', 'admin@school.com']
      );
      console.log('✅ Default admin user created: admin/admin123');
    }

    // Insert default school info if not exists
    const schoolCheck = await query('SELECT id FROM school_info LIMIT 1');
    if (schoolCheck.rows.length === 0) {
      await query(`
        INSERT INTO school_info (name, address, email, phone, session, principal_name, principal_comment)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        'Divine Progressive College',
        'KM4 Along Gboko, Aliade Road, Luga, Gboko West',
        'school@email.com',
        '+234 812 345 6789',
        '2024/2025',
        'Dr. Adebayo Okafor',
        'Keep up the good work'
      ]);
      console.log('✅ Default school info created');
    }

    // Create 30 class arms if not exist
    const armsCheck = await query('SELECT COUNT(*) as count FROM class_arms');
    if (parseInt(armsCheck.rows[0].count) === 0) {
      const classes = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'];
      const letters = ['A', 'B', 'C', 'D', 'E'];
      
      for (const cls of classes) {
        for (const letter of letters) {
          const className = cls + letter;
          const password = cls.toLowerCase() + letter.toLowerCase();
          const hashedPassword = await require('bcryptjs').hash(password, 10);
          
          await query(
            'INSERT INTO class_arms (name, password_hash, student_names) VALUES ($1, $2, $3)',
            [className, hashedPassword, JSON.stringify(Array(50).fill(''))]
          );
          
          // Insert default assessment config
          await query(
            'INSERT INTO assessment_config (class_name, ca1_max, ca2_max, ca3_max, exam_max) VALUES ($1, $2, $3, $4, $5)',
            [className, 10, 10, 10, 70]
          );
        }
      }
      console.log('✅ Created 30 class arms with assessment config');
    }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
};

module.exports = {
  query,
  pool,
  initializeDatabase
};
