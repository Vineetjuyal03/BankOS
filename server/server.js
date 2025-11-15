const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');



const app = express();
const PORT = 3000;
const accountsRoutes = require('./routes/accounts');
app.use(cors());
app.use(express.json()); // Built-in JSON middleware

// Serve static files with absolute path
app.use(express.static(path.join(__dirname,'..', 'static')));

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);

// Optional: Basic error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ message: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
