const express = require('express');
const { getDbClient } = require('./dbConnection');

const router = express.Router();

// Create user
router.post('/users', async (req, res) => {
  try {
    const { userid, walletBalance } = req.body;

    if (typeof userid !== 'string' || userid.trim() === '') {
      return res.status(400).json({ error: 'userid must be a non-empty string' });
    }
    if (typeof walletBalance !== 'number' || Number.isNaN(walletBalance)) {
      return res.status(400).json({ error: 'walletBalance must be a number' });
    }

    const client = await getDbClient();
    const db = client.db('test');
    const users = db.collection('users');

    // Ensure unique userid
    const existing = await users.findOne({ userid });
    if (existing) {
      return res.status(409).json({ error: 'User with this userid already exists' });
    }

    const doc = { userid, walletBalance };
    const result = await users.insertOne(doc);

    return res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (error) {
    console.error('POST /users error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get user by userid
router.get('/users/:userid', async (req, res) => {
  try {
    const { userid } = req.params;

    const client = await getDbClient();
    const db = client.db('test');
    const users = db.collection('users');

    const user = await users.findOne({ userid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error('GET /users/:userid error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;