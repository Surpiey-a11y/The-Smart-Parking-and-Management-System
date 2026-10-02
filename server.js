// Smart Parking Backend - Neon Postgres
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { require: true }
});

pool.on('error', (err) => {
  console.error('Postgres pool error:', err.message);
});

(async () => {
  try {
    const r = await pool.query('SELECT NOW()');
    console.log('Connected to Neon Postgres at', r.rows[0].now);
  } catch (err) {
    console.error('DB connection failed:', err.message);
  }
})();

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'All fields are required' });

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0)
      return res.status(400).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashed]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0)
      return res.status(400).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Current user
app.get('/api/auth/me', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, email FROM users WHERE id = $1',
    [req.userId]
  );
  res.json(result.rows[0]);
});

// Get slots
app.get('/api/slots', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const SLOT_IDS = ['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','C4'];

    const result = await pool.query(
      'SELECT slot_id FROM reservations WHERE date = $1 AND status = $2',
      [date, 'active']
    );
    const occupied = result.rows.map(r => r.slot_id);

    const slots = SLOT_IDS.map(id => ({
      id,
      status: occupied.includes(id) ? 'occupied' : 'available'
    }));

    res.json(slots);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Create reservation
app.post('/api/reservations', auth, async (req, res) => {
  try {
    const { slotId, date, time, duration } = req.body;
    if (!slotId || !date || !time)
      return res.status(400).json({ error: 'Missing booking details' });

    const conflict = await pool.query(
      'SELECT id FROM reservations WHERE slot_id = $1 AND date = $2 AND status = $3',
      [slotId, date, 'active']
    );
    if (conflict.rows.length > 0)
      return res.status(400).json({ error: 'Slot already booked for this date' });

    const result = await pool.query(
      'INSERT INTO reservations (user_id, slot_id, date, time, duration) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.userId, slotId, date, time, duration || 1]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// My reservations
app.get('/api/reservations/my', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM reservations WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC',
    [req.userId, 'active']
  );
  res.json(result.rows);
});

// Cancel reservation
app.delete('/api/reservations/:id', auth, async (req, res) => {
  const result = await pool.query(
    'UPDATE reservations SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    ['cancelled', req.params.id, req.userId]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ error: 'Reservation not found' });
  res.json({ success: true });
});

// Serve index.html for any unknown route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});