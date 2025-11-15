const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Middleware to verify JWT and get userId
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;  // { id: ..., email: ... }
    next();
  });
}

// Transaction processing queue logic
const transactionQueue = [];
let processing = false;

async function processNextTransaction() {
  if (processing) return;
  if (transactionQueue.length === 0) return;

  processing = true;
  const { req, res } = transactionQueue.shift();

  try {
    await handleTransaction(req, res);
  } catch (error) {
    console.error('Transaction processing error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Internal server error' });
    }
  } finally {
    processing = false;
    processNextTransaction();
  }
}

async function handleTransaction(req, res) {
  const userId = req.user.id;
  const { transaction_type, amount, transaction_pin, from_account, to_account } = req.body;

  if (!transaction_type || !amount || !transaction_pin || !from_account || !to_account) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (!['DEPOSIT', 'WITHDRAW', 'TRANSFER'].includes(transaction_type)) {
    return res.status(400).json({ message: 'Invalid transaction type' });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ message: 'Invalid amount' });
  }

  // Verify from_account ownership and get hashed PIN
  const [fromAccRows] = await pool.query(
    'SELECT transaction_pin FROM accounts WHERE account_no = ? AND owner_user_id = ?',
    [from_account, userId]
  );
  if (fromAccRows.length === 0) {
    return res.status(403).json({ message: 'Unauthorized: from_account not owned by user' });
  }

  const pinMatch = await bcrypt.compare(transaction_pin, fromAccRows[0].transaction_pin);
  if (!pinMatch) {
    return res.status(403).json({ message: 'Incorrect transaction PIN' });
  }

  // Check if to_account exists
  const [toAccRows] = await pool.query(
    'SELECT 1 FROM accounts WHERE account_no = ?',
    [to_account]
  );
  if (toAccRows.length === 0) {
    return res.status(400).json({ message: 'to_account does not exist' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (transaction_type === 'DEPOSIT') {
      await connection.query(
        'UPDATE accounts SET balance = balance + ? WHERE account_no = ?',
        [amount, to_account]
      );
    } else if (transaction_type === 'WITHDRAW') {
      const [balanceRows] = await connection.query(
        'SELECT balance FROM accounts WHERE account_no = ?',
        [from_account]
      );
      if (balanceRows[0].balance < amount) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ message: 'Insufficient funds' });
      }
      await connection.query(
        'UPDATE accounts SET balance = balance - ? WHERE account_no = ?',
        [amount, from_account]
      );
    } else if (transaction_type === 'TRANSFER') {
      const [balanceRows] = await connection.query(
        'SELECT balance FROM accounts WHERE account_no = ?',
        [from_account]
      );
      if (balanceRows[0].balance < amount) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ message: 'Insufficient funds' });
      }
      await connection.query(
        'UPDATE accounts SET balance = balance - ? WHERE account_no = ?',
        [amount, from_account]
      );
      await connection.query(
        'UPDATE accounts SET balance = balance + ? WHERE account_no = ?',
        [amount, to_account]
      );
    }

    const [result] = await connection.query(
      'INSERT INTO transactions (from_account, to_account, amount, transaction_type, transaction_date) VALUES (?, ?, ?, ?, NOW())',
      [from_account, to_account, amount, transaction_type]
    );

    await connection.commit();
    connection.release();

    res.status(201).json({ message: 'Transaction complete', transaction_id: result.insertId });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error(error);
    res.status(500).json({ message: 'Transaction failed' });
  }
}

// Override the /transactions/create route to enqueue requests
router.post('/transactions/create', authenticateToken, (req, res) => {
  transactionQueue.push({ req, res });
  processNextTransaction();
});

// Existing other routes remain unchanged below

// POST /api/accounts/create - create a new account for the logged-in user
router.post('/create', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { account_type, balance, transaction_pin } = req.body;

  if (!account_type || typeof balance !== 'number' || !transaction_pin) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // Hash the transaction PIN before storing
    const hashedPin = await bcrypt.hash(transaction_pin, 10);

    const [result] = await pool.query(
      'INSERT INTO accounts (account_type, owner_user_id, balance, transaction_pin) VALUES (?, ?, ?, ?)',
      [account_type, userId, balance, hashedPin]
    );

    res.status(201).json({ message: 'Account created', account_no: result.insertId });
  } catch (err) {
    console.error('Account creation error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/accounts/user - get all accounts owned by the logged-in user
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [accounts] = await pool.query(
      'SELECT account_no, account_type, balance FROM accounts WHERE owner_user_id = ?',
      [userId]
    );
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/accounts/details?account_no=123 - fetch detailed info for specific account
router.get('/details', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const accountNo = req.query.account_no;

  if (!accountNo) {
    return res.status(400).json({ message: 'Missing account_no query parameter' });
  }

  try {
    // Fetch account joined with user email to show owner email
    const [rows] = await pool.query(
      `SELECT a.account_no, a.account_type, a.balance, a.created_at, u.email as owner_email
       FROM accounts a
       JOIN users u ON a.owner_user_id = u.user_id
       WHERE a.account_no = ? AND a.owner_user_id = ?`,
      [accountNo, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Account not found or access denied' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching account details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
router.get('/transactions/history', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const accountNo = req.query.account_no;

  if (!accountNo) {
    return res.status(400).json({ message: 'Missing account_no query parameter' });
  }

  try {
    // Verify that user owns the account or has access
    const [accountRows] = await pool.query(
      'SELECT account_no FROM accounts WHERE account_no = ? AND owner_user_id = ?',
      [accountNo, userId]
    );

    if (accountRows.length === 0) {
      return res.status(403).json({ message: 'Access denied to this account' });
    }

    // Get all transactions where account is from_account or to_account, sorted by date desc
    const [transactions] = await pool.query(
      `SELECT transaction_id, from_account, to_account, amount, transaction_type, transaction_date
       FROM transactions
       WHERE from_account = ? OR to_account = ?
       ORDER BY transaction_date DESC`,
      [accountNo, accountNo]
    );

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
