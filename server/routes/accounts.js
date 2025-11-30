const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 4000,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
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

// Linked List Queue implementation for interest processing
class LinkedListQueue {
  constructor() {
    this.head = null;
    this.tail = null;
  }
  enqueue(value) {
    const newNode = { value, next: null };
    if (!this.tail) {
      this.head = this.tail = newNode;
    } else {
      this.tail.next = newNode;
      this.tail = newNode;
    }
  }
  dequeue() {
    if (!this.head) return null;
    const removedValue = this.head.value;
    this.head = this.head.next;
    if (!this.head) this.tail = null;
    return removedValue;
  }
  peek() {
    return this.head ? this.head.value : null;
  }
  isEmpty() {
    return this.head === null;
  }
}

const INTEREST_RATE = 0.05; // 5% annual interest fixed
const COMPOUNDING_PERIOD_SEC = 1; // 1 second compounding interval (example)

const interestQueue = new LinkedListQueue();
let interestProcessing = false;

// Enqueue account for interest processing including maturity time
function enqueueInterest(accountNo, nextTime, maturityTime = null) {
  interestQueue.enqueue({ accountNo, nextTime, maturityTime });
  processInterestQueue();
}

// Process the interest queue asynchronously
async function processInterestQueue() {
  if (interestProcessing) return;
  if (interestQueue.isEmpty()) return;

  interestProcessing = true;

  while (!interestQueue.isEmpty()) {
    const now = Date.now();
    const nextItem = interestQueue.peek();

    // If FD matured, remove from queue and skip processing
    if (nextItem.maturityTime && now >= nextItem.maturityTime) {
      interestQueue.dequeue();
      // Optional: perform maturity payout or finalization here
      continue;  // Skip compounding for matured accounts
    }

    if (nextItem.nextTime > now) {
      // Wait until next scheduled compounding time
      await new Promise(resolve => setTimeout(resolve, nextItem.nextTime - now));
    }

    // Dequeue for processing
    const currentItem = interestQueue.dequeue();

    await processInterestForAccount(currentItem.accountNo);

    // Update next compounding time
    currentItem.nextTime += COMPOUNDING_PERIOD_SEC * 1000;

    // Re-enqueue if not matured yet
    if (!currentItem.maturityTime || currentItem.nextTime < currentItem.maturityTime) {
      interestQueue.enqueue(currentItem);
    } else {
      // FD matured, do not re-enqueue
      // Optional: log or notify maturity event here
    }
  }

  interestProcessing = false;
}

// Process interest for single account (compound interest)
async function processInterestForAccount(accountNo) {
  try {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    // Lock the account row for update
    const [rows] = await connection.query(
      'SELECT balance FROM accounts WHERE account_no = ? FOR UPDATE',
      [accountNo]
    );

    if (rows.length === 0) {
      await connection.rollback();
      connection.release();
      return;
    }

    const balance = parseFloat(rows[0].balance);
    const interest = balance * INTEREST_RATE ;
    const newBalance = balance + interest;

    await connection.query(
      'UPDATE accounts SET balance = ? WHERE account_no = ?',
      [newBalance, accountNo]
    );

    // Optionally, log the accrued interest as a transaction here

    await connection.commit();
    connection.release();
  } catch (err) {
    console.error('Error processing interest for account', accountNo, err);
  }
}

// Transaction processing queue logic (existing)
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

  // Verify ownership or access of from_account and get transaction_pin hash
  const [fromAccRows] = await pool.query(
    `SELECT a.transaction_pin
     FROM accounts a
     LEFT JOIN user_account_links ual ON a.account_no = ual.account_no
     WHERE a.account_no = ? AND (a.owner_user_id = ? OR ual.user_id = ?)`,
    [from_account, userId, userId]
  );
  if (fromAccRows.length === 0) {
    return res.status(403).json({ message: 'Unauthorized: no access to from_account' });
  }

  const pinMatch = await bcrypt.compare(transaction_pin, fromAccRows[0].transaction_pin);
  if (!pinMatch) {
    return res.status(403).json({ message: 'Incorrect transaction PIN' });
  }

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

// POST /api/accounts/create - create a new account for the logged-in user
router.post('/create', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { account_type, balance, transaction_pin, fd_duration_seconds } = req.body;

  if (!account_type || typeof balance !== 'number' || !transaction_pin) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const hashedPin = await bcrypt.hash(transaction_pin, 10);

    let fd_maturity_date = null;
    if (account_type.toUpperCase() === 'FD' && fd_duration_seconds) {
      fd_maturity_date = new Date(Date.now() + fd_duration_seconds * 1000);
    }

    const [result] = await pool.query(
      'INSERT INTO accounts (account_type, owner_user_id, balance, transaction_pin, fd_maturity_date) VALUES (?, ?, ?, ?, ?)',
      [account_type, userId, balance, hashedPin, fd_maturity_date]
    );

    // Enqueue for interest processing including maturity time
    if (account_type.toUpperCase() === 'FD') {
      const nextTime = Date.now() + COMPOUNDING_PERIOD_SEC * 1000;
      enqueueInterest(result.insertId, nextTime, fd_maturity_date ? fd_maturity_date.getTime() : null);
      // Explicitly start processing interest if needed
      processInterestQueue();
    }


    res.status(201).json({ message: 'Account created', account_no: result.insertId });
  } catch (err) {
    console.error('Account creation error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/accounts/user - get all accounts owned or accessible by the logged-in user
router.get('/user', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [accounts] = await pool.query(
      `SELECT DISTINCT a.account_no, a.account_type, a.balance
       FROM accounts a
       LEFT JOIN user_account_links ual ON a.account_no = ual.account_no
       WHERE a.owner_user_id = ? OR ual.user_id = ?`,
      [userId, userId]
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

  if (!accountNo) return res.status(400).json({ message: 'Missing account_no' });

  try {
    // Check access: owner or linked user
    const [rows] = await pool.query(
      `SELECT a.account_no, a.account_type, a.balance, a.owner_user_id, u.email AS owner_email, a.created_at, a.fd_maturity_date
       FROM accounts a
       JOIN users u ON u.user_id = a.owner_user_id
       LEFT JOIN user_account_links ua ON ua.account_no = a.account_no
       WHERE a.account_no = ? AND (a.owner_user_id = ? OR ua.user_id = ?)`,
      [accountNo, userId, userId]
    );

    if (rows.length === 0) {
      return res.status(403).json({ message: 'Access denied or account not found' });
    }

    const account = rows[0];
    res.json(account);
  } catch (error) {
    console.error('Error fetching account details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/accounts/transactions/history?account_no=123 - fetch transaction history
router.get('/transactions/history', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const accountNo = req.query.account_no;

  if (!accountNo) return res.status(400).json({ message: 'Missing account_no' });

  try {
    const [authRows] = await pool.query(
      `SELECT 1 FROM accounts WHERE account_no = ? AND owner_user_id = ?
       UNION
       SELECT 1 FROM user_account_links WHERE account_no = ? AND user_id = ?`,
      [accountNo, userId, accountNo, userId]
    );

    if (authRows.length === 0) {
      return res.status(403).json({ message: 'Access denied to view transactions' });
    }

    const [transactions] = await pool.query(
      `SELECT transaction_id, transaction_type, from_account, to_account, amount, transaction_date
       FROM transactions
       WHERE from_account = ? OR to_account = ?
       ORDER BY transaction_date DESC`,
      [accountNo, accountNo]
    );

    res.json(transactions);
  } catch (err) {
    console.error('Error fetching transaction history:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET list of users with access to an account (including primary owner)
router.get('/access', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const accountNo = req.query.account_no;

  if (!accountNo) return res.status(400).json({ message: 'Missing account_no' });

  // Verify requesting user has access via links or is primary owner
  const [verifyRows] = await pool.query(
    `SELECT 1 FROM user_account_links WHERE user_id = ? AND account_no = ?
     UNION 
     SELECT 1 FROM accounts WHERE owner_user_id = ? AND account_no = ?`,
    [userId, accountNo, userId, accountNo]
  );
  if (verifyRows.length === 0) {
    return res.status(403).json({ message: 'Access denied' });
  }

  // Get owner user id
  const [ownerRows] = await pool.query(
    `SELECT owner_user_id FROM accounts WHERE account_no = ?`,
    [accountNo]
  );
  if (ownerRows.length === 0) {
    return res.status(404).json({ message: 'Account not found' });
  }
  const ownerUserId = ownerRows[0].owner_user_id;

  // Get all users linked plus owner
  const [users] = await pool.query(
    `SELECT u.user_id, u.username, u.email 
     FROM users u 
     JOIN user_account_links ua ON u.user_id = ua.user_id 
     WHERE ua.account_no = ?
     UNION 
     SELECT u2.user_id, u2.username, u2.email 
     FROM users u2
     WHERE u2.user_id = ?
     ORDER BY username`,
    [accountNo, ownerUserId]
  );

  res.json({ owner_user_id: ownerUserId, users });
});

// POST add user access to account
router.post('/access/add', authenticateToken, async (req, res) => {
  const requestingUserId = req.user.id;
  const { account_no, user_email, transaction_pin } = req.body;

  if (!account_no || !user_email || !transaction_pin) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  try {
    // Check requester has access to the account
    const [verifyRows] = await pool.query(
      `SELECT 1 FROM user_account_links WHERE user_id = ? AND account_no = ?
       UNION
       SELECT 1 FROM accounts WHERE owner_user_id = ? AND account_no = ?`,
      [requestingUserId, account_no, requestingUserId, account_no]
    );
    if (verifyRows.length === 0) {
      return res.status(403).json({ message: 'Access denied to manage this account' });
    }

    // Get account owner transaction PIN
    const [ownerRows] = await pool.query(
      `SELECT transaction_pin FROM accounts WHERE account_no = ?`,
      [account_no]
    );
    if (ownerRows.length === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }
    const hashedPin = ownerRows[0].transaction_pin;

    // Verify transaction pin
    const pinValid = await bcrypt.compare(transaction_pin, hashedPin);
    if (!pinValid) {
      return res.status(403).json({ message: 'Incorrect transaction PIN' });
    }

    // Lookup user by email
    const [userRows] = await pool.query(
      `SELECT user_id FROM users WHERE email = ?`,
      [user_email]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User with this email does not exist' });
    }
    const targetUserId = userRows[0].user_id;

    // Add user access (ignore if exists)
    await pool.query(
      `INSERT IGNORE INTO user_account_links (user_id, account_no) VALUES (?, ?)`,
      [targetUserId, account_no]
    );

    res.json({ message: 'User access added successfully' });
  } catch (err) {
    console.error('Error adding user access:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/access/remove', authenticateToken, async (req, res) => {
  const requestingUserId = req.user.id;
  const { account_no, user_id, transaction_pin } = req.body;

  if (!account_no || !user_id || !transaction_pin) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  // Verify requester has access to the account (linked user or owner)
  const [verifyRows] = await pool.query(
    `SELECT 1 FROM user_account_links WHERE user_id = ? AND account_no = ?
     UNION
     SELECT 1 FROM accounts WHERE owner_user_id = ? AND account_no = ?`,
    [requestingUserId, account_no, requestingUserId, account_no]
  );

  if (verifyRows.length === 0) {
    return res.status(403).json({ message: 'Access denied to manage this account' });
  }

  // Get account owner's transaction PIN hash
  const [ownerRows] = await pool.query(
    'SELECT transaction_pin, owner_user_id FROM accounts WHERE account_no = ?',
    [account_no]
  );

  if (ownerRows.length === 0) {
    return res.status(404).json({ message: 'Account not found' });
  }

  const { transaction_pin: hashedPin, owner_user_id } = ownerRows[0];

  // Prevent removing owner's own access
  if (user_id === owner_user_id) {
    return res.status(400).json({ message: 'Cannot remove owner access' });
  }

  // Verify transaction PIN
  const pinValid = await bcrypt.compare(transaction_pin, hashedPin);
  if (!pinValid) {
    return res.status(403).json({ message: 'Incorrect transaction PIN' });
  }

  // Delete user access mapping
  await pool.query(
    'DELETE FROM user_account_links WHERE user_id = ? AND account_no = ?',
    [user_id, account_no]
  );

  res.json({ message: 'User access removed successfully' });
});

module.exports = router;
