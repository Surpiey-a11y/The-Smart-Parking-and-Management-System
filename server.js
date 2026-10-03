// Smart Parking Backend - Neon Postgres + ESP32 hardware integration
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
const HARDWARE_API_KEY = process.env.HARDWARE_API_KEY || 'change-this-hardware-key';

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

// -----------------------------------------------------------
// Auth
// -----------------------------------------------------------

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

app.get('/api/auth/me', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, email FROM users WHERE id = $1',
    [req.userId]
  );
  res.json(result.rows[0]);
});

// -----------------------------------------------------------
// Slot configuration — 1 VIP + 2 public
// -----------------------------------------------------------
const SLOTS = [
  { id: 'V1', type: 'vip' },
  { id: 'P1', type: 'public' },
  { id: 'P2', type: 'public' }
];

// ESP32 physical sensor → website slot
// Sensor 1 = P1 (public), Sensor 2 = P2 (public), Sensor 3 = V1 (VIP)
const SENSOR_TO_SLOT = { 1: 'P1', 2: 'P2', 3: 'V1' };

// -----------------------------------------------------------
// Slots — merges reservations + physical sensors
// -----------------------------------------------------------
app.get('/api/slots', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const reservedResult = await pool.query(
      'SELECT slot_id FROM reservations WHERE date = $1 AND status = $2',
      [date, 'active']
    );
    const reserved = reservedResult.rows.map(r => r.slot_id);

    const sensorResult = await pool.query('SELECT slot_id, occupied FROM slot_sensors');
    const sensorMap = {};
    sensorResult.rows.forEach(r => { sensorMap[r.slot_id] = r.occupied; });

    const slots = SLOTS.map(s => {
      const isReserved = reserved.includes(s.id);
      const isPhysicallyOccupied = sensorMap[s.id] === true;
      const occupied = isReserved || isPhysicallyOccupied;

      return {
        ...s,
        status: occupied ? 'occupied' : 'available',
        reserved: isReserved,
        physicallyOccupied: isPhysicallyOccupied
      };
    });

    const summary = {
      vip: {
        total: slots.filter(s => s.type === 'vip').length,
        available: slots.filter(s => s.type === 'vip' && s.status === 'available').length
      },
      public: {
        total: slots.filter(s => s.type === 'public').length,
        available: slots.filter(s => s.type === 'public' && s.status === 'available').length
      }
    };

    res.json({ slots, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// Hardware endpoint — ESP32 posts one sensor update
// -----------------------------------------------------------
app.post('/api/hardware/slot-update', async (req, res) => {
  try {
    const key = req.headers['x-api-key'];
    if (key !== HARDWARE_API_KEY) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const { sensorId, occupied } = req.body;
    if (sensorId === undefined || typeof occupied !== 'boolean') {
      return res.status(400).json({ error: 'sensorId and occupied required' });
    }

    const slotId = SENSOR_TO_SLOT[sensorId];
    if (!slotId) {
      return res.status(400).json({ error: 'Unknown sensorId' });
    }

    await pool.query(
      `INSERT INTO slot_sensors (slot_id, occupied, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (slot_id) DO UPDATE
         SET occupied = EXCLUDED.occupied, updated_at = NOW()`,
      [slotId, occupied]
    );

    console.log(`[HW] Sensor ${sensorId} → ${slotId} = ${occupied ? 'OCCUPIED' : 'FREE'}`);
    res.json({ ok: true, slotId, occupied });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// Hardware endpoint — batch (all 3 sensors at once)
// -----------------------------------------------------------
app.post('/api/hardware/batch-update', async (req, res) => {
  try {
    const key = req.headers['x-api-key'];
    if (key !== HARDWARE_API_KEY) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const { sensors } = req.body;
    if (!Array.isArray(sensors)) {
      return res.status(400).json({ error: 'sensors array required' });
    }

    for (const s of sensors) {
      const slotId = SENSOR_TO_SLOT[s.sensorId];
      if (!slotId) continue;

      await pool.query(
        `INSERT INTO slot_sensors (slot_id, occupied, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (slot_id) DO UPDATE
           SET occupied = EXCLUDED.occupied, updated_at = NOW()`,
        [slotId, s.occupied]
      );
    }

    console.log('[HW] Batch update:',
      sensors.map(s => `${s.sensorId}=${s.occupied}`).join(' '));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// Reservations
// -----------------------------------------------------------
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

    const sensor = await pool.query(
      'SELECT occupied FROM slot_sensors WHERE slot_id = $1',
      [slotId]
    );
    if (sensor.rows.length > 0 && sensor.rows[0].occupied) {
      return res.status(400).json({ error: 'That slot is currently occupied' });
    }

    // Generate a 4-digit code for VIP bookings
    let code = null;
    if (slotId === 'V1') {
      code = String(Math.floor(1000 + Math.random() * 9000));
      console.log(`[VIP] Booking V1 — code generated: ${code}`);
    }

    const result = await pool.query(
      'INSERT INTO reservations (user_id, slot_id, date, time, duration, code) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.userId, slotId, date, time, duration || 1, code]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reservations/my', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM reservations WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC',
    [req.userId, 'active']
  );
  res.json(result.rows);
});

app.delete('/api/reservations/:id', auth, async (req, res) => {
  const result = await pool.query(
    'UPDATE reservations SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    ['cancelled', req.params.id, req.userId]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ error: 'Reservation not found' });
  res.json({ success: true });
});

// -----------------------------------------------------------
// VIP gate control
// -----------------------------------------------------------

app.post('/api/vip/verify-code', auth, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || String(code).length !== 4) {
      return res.status(400).json({ error: '4-digit code required' });
    }

    // ← FIX: cast CURRENT_DATE to text so it matches the TEXT 'date' column
    const result = await pool.query(
      `SELECT * FROM reservations 
       WHERE code = $1 
         AND slot_id = 'V1' 
         AND status = 'active'
         AND date = CURRENT_DATE::text
       LIMIT 1`,
      [String(code)]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired VIP code' });
    }

    await pool.query(
      `INSERT INTO vip_command (id, open_vip) VALUES (1, true)
       ON CONFLICT (id) DO UPDATE SET open_vip = true`
    );

    console.log(`[VIP] Code ${code} verified — gate command sent`);
    res.json({ ok: true, message: 'VIP gate opening...' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vip/command', async (req, res) => {
  try {
    const result = await pool.query('SELECT open_vip FROM vip_command WHERE id = 1');
    res.json({ openVIP: result.rows[0]?.open_vip || false });
  } catch (err) {
    res.status(500).json({ openVIP: false, error: err.message });
  }
});

app.post('/api/vip/command/ack', async (req, res) => {
  try {
    await pool.query('UPDATE vip_command SET open_vip = false WHERE id = 1');
    console.log('[VIP] Gate opened — command reset');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve index.html for unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});