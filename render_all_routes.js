// ===========================================
// routes/formmasters.js - Form Masters Routes
// ===========================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authenticateToken, adminOnly } = require('./auth');

router.get('/', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await query('SELECT id, name, email FROM form_masters');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch form masters' });
  }
});

router.post('/', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await query(
      'INSERT INTO form_masters (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashedPassword]
    );
    
    res.json({ ...result.rows[0], message: 'Form master created successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create form master' });
  }
});

router.delete('/:id', authenticateToken, adminOnly, async (req, res) => {
  try {
    await query('UPDATE class_arms SET form_master_id = NULL WHERE form_master_id = $1', [req.params.id]);
    await query('DELETE FROM form_masters WHERE id = $1', [req.params.id]);
    res.json({ message: 'Form master deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete form master' });
  }
});

module.exports = router;

// ===========================================
// routes/arms.js - Class Arms Routes
// ===========================================
const express2 = require('express');
const router2 = express2.Router();
const { query: query2 } = require('../db');
const { authenticateToken: auth2 } = require('./auth');

router2.get('/', auth2, async (req, res) => {
  try {
    const result = await query2(`
      SELECT ca.*, fm.name as form_master_name, fm.email as form_master_email
      FROM class_arms ca
      LEFT JOIN form_masters fm ON ca.form_master_id = fm.id
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch class arms' });
  }
});

router2.put('/:id/assign', auth2, async (req, res) => {
  try {
    const { formMasterId } = req.body;
    await query2('UPDATE class_arms SET form_master_id = $1 WHERE id = $2', [formMasterId || null, req.params.id]);
    res.json({ message: 'Form master assigned successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign form master' });
  }
});

router2.put('/:id/students', auth2, async (req, res) => {
  try {
    const { studentNames } = req.body;
    await query2('UPDATE class_arms SET student_names = $1 WHERE id = $2', [JSON.stringify(studentNames), req.params.id]);
    res.json({ message: 'Student names updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update student names' });
  }
});

module.exports = router2;

// ===========================================
// routes/students.js - Students Routes
// ===========================================
const express3 = require('express');
const router3 = express3.Router();
const { query: query3 } = require('../db');
const { authenticateToken: auth3 } = require('./auth');

router3.get('/', auth3, async (req, res) => {
  try {
    const { className, term } = req.query;
    let sql = 'SELECT * FROM students WHERE 1=1';
    const params = [];
    
    if (className) {
      params.push(className);
      sql += ` AND class_name = $${params.length}`;
    }
    if (term) {
      params.push(term);
      sql += ` AND term = $${params.length}`;
    }
    
    const studentsResult = await query3(sql, params);
    
    for (let student of studentsResult.rows) {
      const subjectsResult = await query3('SELECT * FROM subjects WHERE student_id = $1', [student.id]);
      const affectiveResult = await query3('SELECT * FROM affective_ratings WHERE student_id = $1', [student.id]);
      const psychomotorResult = await query3('SELECT * FROM psychomotor_ratings WHERE student_id = $1', [student.id]);
      
      student.subjects = subjectsResult.rows;
      student.affective = {};
      student.psychomotor = {};
      
      affectiveResult.rows.forEach(a => { student.affective[a.domain] = a.rating; });
      psychomotorResult.rows.forEach(p => { student.psychomotor[p.domain] = p.rating; });
    }
    
    res.json(studentsResult.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

router3.post('/', auth3, async (req, res) => {
  const client = await query3.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { studentName, admNo, dob, age, sex, term, className, subjects, affective, psychomotor, totalObtained, totalObtainable, averageScore, passport, formMaster, formMasterComment, formMasterSignature } = req.body;
    
    const studentResult = await client.query(`
      INSERT INTO students (student_name, adm_no, dob, age, sex, term, class_name, total_obtained, total_obtainable, average_score, passport, form_master, form_master_comment, form_master_signature)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [studentName, admNo, dob, age, sex, term, className, totalObtained, totalObtainable, averageScore, passport, formMaster, formMasterComment, formMasterSignature]);
    
    const studentId = studentResult.rows[0].id;
    
    for (const subject of subjects) {
      await client.query(
        'INSERT INTO subjects (student_id, subject_name, ca1, ca2, ca3, exam, total, grade, remark) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [studentId, subject.name, subject.ca1, subject.ca2, subject.ca3, subject.exam, subject.total, subject.grade, subject.remark]
      );
    }
    
    for (const [domain, rating] of Object.entries(affective)) {
      await client.query('INSERT INTO affective_ratings (student_id, domain, rating) VALUES ($1, $2, $3)', [studentId, domain, rating]);
    }
    
    for (const [domain, rating] of Object.entries(psychomotor)) {
      await client.query('INSERT INTO psychomotor_ratings (student_id, domain, rating) VALUES ($1, $2, $3)', [studentId, domain, rating]);
    }
    
    await client.query('COMMIT');
    res.json({ id: studentId, message: 'Student saved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to save student' });
  } finally {
    client.release();
  }
});

router3.post('/compute-positions', auth3, async (req, res) => {
  try {
    const result = await query3('SELECT id, class_name, term, average_score FROM students');
    const grouped = {};
    
    result.rows.forEach(s => {
      const key = `${s.class_name}-${s.term}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    });
    
    for (const studentList of Object.values(grouped)) {
      studentList.sort((a, b) => b.average_score - a.average_score);
      
      for (let i = 0; i < studentList.length; i++) {
        await query3('UPDATE students SET position = $1, position_of = $2 WHERE id = $3', [i + 1, studentList.length, studentList[i].id]);
      }
    }
    
    res.json({ message: 'Positions computed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to compute positions' });
  }
});

module.exports = router3;

// ===========================================
// routes/school.js - School Info Routes
// ===========================================
const express4 = require('express');
const router4 = express4.Router();
const { query: query4 } = require('../db');
const { authenticateToken: auth4, adminOnly: admin4 } = require('./auth');

router4.get('/info', auth4, async (req, res) => {
  try {
    const result = await query4('SELECT * FROM school_info LIMIT 1');
    res.json(result.rows[0] || {});
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch school info' });
  }
});

router4.put('/info', auth4, admin4, async (req, res) => {
  try {
    const { name, address, email, phone, session, principalName, principalComment, logo, principalSignature } = req.body;
    
    const existing = await query4('SELECT id FROM school_info LIMIT 1');
    
    if (existing.rows.length > 0) {
      await query4(`
        UPDATE school_info SET name = $1, address = $2, email = $3, phone = $4, session = $5, principal_name = $6, principal_comment = $7, logo = $8, principal_signature = $9
        WHERE id = $10
      `, [name, address, email, phone, session, principalName, principalComment, logo, principalSignature, existing.rows[0].id]);
    } else {
      await query4(`
        INSERT INTO school_info (name, address, email, phone, session, principal_name, principal_comment, logo, principal_signature)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [name, address, email, phone, session, principalName, principalComment, logo, principalSignature]);
    }
    
    res.json({ message: 'School information saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save school info' });
  }
});

module.exports = router4;

// ===========================================
// routes/assessment.js - Assessment Config Routes
// ===========================================
const express5 = require('express');
const router5 = express5.Router();
const { query: query5 } = require('../db');
const { authenticateToken: auth5, adminOnly: admin5 } = require('./auth');

router5.get('/config', auth5, async (req, res) => {
  try {
    const result = await query5('SELECT * FROM assessment_config');
    const config = {};
    result.rows.forEach(c => {
      config[c.class_name] = { ca1: c.ca1_max, ca2: c.ca2_max, ca3: c.ca3_max, exam: c.exam_max };
    });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch assessment config' });
  }
});

router5.put('/config', auth5, admin5, async (req, res) => {
  try {
    const { config } = req.body;
    
    for (const [className, values] of Object.entries(config)) {
      await query5(`
        INSERT INTO assessment_config (class_name, ca1_max, ca2_max, ca3_max, exam_max)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (class_name) DO UPDATE SET ca1_max = $2, ca2_max = $3, ca3_max = $4, exam_max = $5
      `, [className, values.ca1, values.ca2, values.ca3, values.exam]);
    }
    
    res.json({ message: 'Assessment configuration saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save assessment config' });
  }
});

module.exports = router5;

// ===========================================
// routes/signatures.js - Teacher Signatures Routes
// ===========================================
const express6 = require('express');
const router6 = express6.Router();
const { query: query6 } = require('../db');
const { authenticateToken: auth6, adminOnly: admin6 } = require('./auth');

router6.get('/', auth6, async (req, res) => {
  try {
    const result = await query6('SELECT * FROM teacher_signatures');
    const signatures = {};
    result.rows.forEach(s => { signatures[s.subject_name] = s.signature_data; });
    res.json(signatures);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch signatures' });
  }
});

router6.post('/', auth6, admin6, async (req, res) => {
  try {
    const { subject, signatureData } = req.body;
    await query6(`
      INSERT INTO teacher_signatures (subject_name, signature_data)
      VALUES ($1, $2)
      ON CONFLICT (subject_name) DO UPDATE SET signature_data = $2
    `, [subject, signatureData]);
    res.json({ message: 'Teacher signature uploaded successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload signature' });
  }
});

router6.delete('/:subject', auth6, admin6, async (req, res) => {
  try {
    await query6('DELETE FROM teacher_signatures WHERE subject_name = $1', [decodeURIComponent(req.params.subject)]);
    res.json({ message: 'Teacher signature deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete signature' });
  }
});

module.exports = router6;
