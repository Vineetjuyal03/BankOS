const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const client = new OAuth2Client('900108182771-8jd4ilbcg4ffklfhiv1sjrh35gm33a66.apps.googleusercontent.com');
const JWT_SECRET = process.env.JWT_SECRET;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: 4000, // TiDB Serverless port
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    minVersion: 'TLSv1.2'
  }
});

function createToken(user) {
  return jwt.sign({ id: user.user_id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
}

// Register route
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ message: 'Incorrect password' });
    }
    const token = createToken(user);
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Google Sign-In route
router.post('/google', async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: '900108182771-8jd4ilbcg4ffklfhiv1sjrh35gm33a66.apps.googleusercontent.com',
    });
    const payload = ticket.getPayload();
    let [users] = await pool.query('SELECT * FROM users WHERE email = ?', [payload.email]);
    if (users.length === 0) {
      // Create user for the Google account with empty password
      const [result] = await pool.query(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        [payload.name, payload.email, '']
      );
      users = [{ user_id: result.insertId, username: payload.name, email: payload.email }];
    }
    const jwtToken = createToken(users[0]);
    res.json({ token: jwtToken });
  } catch (error) {
    console.error('Google token error:', error);
    res.status(400).json({ message: 'Google token verification failed' });
  }
});
router.post('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'No token provided' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    res.json({ userId: decoded.id, email: decoded.email });
  });
});

module.exports = router;
