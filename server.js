const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'carbon_footprint_super_secret_token_key_2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve client files (index.html, styles.css, app.js)

// Database setup
const dbPath = path.join(__dirname, 'carbon.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    runMigrations();
  }
});

// Database migrations
function runMigrations() {
  db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      onboarded INTEGER DEFAULT 0,
      baseline_annual INTEGER DEFAULT 4500,
      weekly_budget REAL DEFAULT 69.2,
      points INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0,
      level_val INTEGER DEFAULT 1,
      level_name TEXT DEFAULT 'Sprout',
      streak INTEGER DEFAULT 5,
      habits_carfree INTEGER DEFAULT 0,
      habits_plantbased INTEGER DEFAULT 0,
      habits_coldcycle INTEGER DEFAULT 0,
      habits_noplastic INTEGER DEFAULT 0
    )`);

    // Ledger table
    db.run(`CREATE TABLE IF NOT EXISTS ledger (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      sub_category TEXT NOT NULL,
      amount REAL NOT NULL,
      unit TEXT NOT NULL,
      emissions REAL NOT NULL,
      label TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )`);
  });
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token is invalid or expired' });
    }
    req.user = user; // { id, email }
    next();
  });
}

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

// Register Route
app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Check if user already exists
  db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error checking user' });
    }
    if (row) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    // Hash password
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        return res.status(500).json({ error: 'Error processing password' });
      }

      // Insert new user
      const query = `INSERT INTO users (email, password) VALUES (?, ?)`;
      db.run(query, [email, hashedPassword], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to register user' });
        }

        const userId = this.lastID;
        const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '24h' });

        res.status(201).json({
          message: 'User successfully registered',
          token,
          user: { id: userId, email }
        });
      });
    });
  });
});

// Login Route
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Compare passwords
    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        return res.status(500).json({ error: 'Error comparing passwords' });
      }
      if (!isMatch) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

      res.status(200).json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email
        }
      });
    });
  });
});

// ==========================================
// USER STATE ENDPOINTS
// ==========================================

// Get user state
app.get('/api/user/state', authenticateToken, (req, res) => {
  db.get('SELECT * FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch user state' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      onboarded: user.onboarded === 1,
      userProfile: { email: user.email },
      baselineAnnual: user.baseline_annual,
      weeklyBudget: user.weekly_budget,
      points: user.points,
      xp: user.xp,
      levelVal: user.level_val,
      levelName: user.level_name,
      streak: user.streak,
      habitsChecked: {
        carfree: user.habits_carfree === 1,
        plantbased: user.habits_plantbased === 1,
        coldcycle: user.habits_coldcycle === 1,
        noplastic: user.habits_noplastic === 1
      }
    });
  });
});

// Update user state
app.post('/api/user/state', authenticateToken, (req, res) => {
  const {
    onboarded,
    baselineAnnual,
    weeklyBudget,
    points,
    xp,
    levelVal,
    levelName,
    streak,
    habitsChecked
  } = req.body;

  const query = `UPDATE users SET 
    onboarded = ?, 
    baseline_annual = ?, 
    weekly_budget = ?, 
    points = ?, 
    xp = ?, 
    level_val = ?, 
    level_name = ?, 
    streak = ?, 
    habits_carfree = ?, 
    habits_plantbased = ?, 
    habits_coldcycle = ?, 
    habits_noplastic = ? 
    WHERE id = ?`;

  db.run(query, [
    onboarded ? 1 : 0,
    baselineAnnual || 4500,
    weeklyBudget || 69.2,
    points || 0,
    xp || 0,
    levelVal || 1,
    levelName || 'Sprout',
    streak || 5,
    habitsChecked?.carfree ? 1 : 0,
    habitsChecked?.plantbased ? 1 : 0,
    habitsChecked?.coldcycle ? 1 : 0,
    habitsChecked?.noplastic ? 1 : 0,
    req.user.id
  ], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to update state' });
    }
    res.json({ message: 'State successfully synced' });
  });
});

// ==========================================
// LEDGER ENDPOINTS
// ==========================================

// Get user ledger entries
app.get('/api/ledger', authenticateToken, (req, res) => {
  db.all('SELECT * FROM ledger WHERE user_id = ? ORDER BY rowid DESC', [req.user.id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch ledger' });
    }

    res.json(rows.map(row => ({
      id: row.id,
      date: row.date,
      category: row.category,
      subCategory: row.sub_category,
      amount: row.amount,
      unit: row.unit,
      emissions: row.emissions,
      label: row.label
    })));
  });
});

// Add ledger entry
app.post('/api/ledger', authenticateToken, (req, res) => {
  const { id, date, category, subCategory, amount, unit, emissions, label } = req.body;

  if (!id || !date || !category || !subCategory || !amount || !unit || emissions === undefined || !label) {
    return res.status(400).json({ error: 'Missing ledger entry fields' });
  }

  const query = `INSERT INTO ledger (id, user_id, date, category, sub_category, amount, unit, emissions, label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(query, [id, req.user.id, date, category, subCategory, amount, unit, emissions, label], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Failed to add ledger entry' });
    }
    res.status(201).json({ message: 'Entry added successfully' });
  });
});

// Delete ledger entry
app.delete('/api/ledger/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM ledger WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete entry' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    res.json({ message: 'Entry successfully deleted' });
  });
});

// Clear ledger entries
app.post('/api/ledger/clear', authenticateToken, (req, res) => {
  db.run('DELETE FROM ledger WHERE user_id = ?', [req.user.id], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to clear ledger' });
    }
    res.json({ message: 'Ledger cleared successfully' });
  });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
