const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getUserCollection } = require('./dbConnection');

const router = express.Router();

// Create user
router.post('/registerUser', async (req, res) => {
  try {
    const userCollection = await getUserCollection();
    console.log(req.body)
    const { userid } = req.body;

    if (typeof userid !== 'string' || userid.trim() === '') {
      return res.status(400).json({ error: 'userid must be a non-empty string' });
    }

    // Ensure unique userid
    const existing = await userCollection.findOne({ userid });
    if (existing) {
      return res.status(409).json({ error: 'User with this userid already exists' });
    }

    const doc = { userid, walletBalance:0, gifts: [] };
    const result = await userCollection.insertOne(doc);
    const { _id,...data} = doc;
    return res.status(201).json({  ...data });
  } catch (error) {
    console.error('POST /users error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get user by userid
router.get('/users/:userid', async (req, res) => {
  try {
    const userCollection = await getUserCollection();
    const { userid } = req.params;
    const user = await userCollection.findOne({ userid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error('GET /users/:userid error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/addGift', async (req, res) => {
    try {
      const userCollection = await getUserCollection();
      const { userid, gift } = req.body;
  
      // 1. Basic Validation
      if (typeof gift !== 'object' || gift === null) {
        return res.status(400).json({ error: 'gift must be a non-null object' });
      }
  
      const { title, amount, giftMessage, senderid } = gift;
  
      if (
        typeof userid !== 'string' ||
        typeof title !== 'string' ||
        typeof amount !== 'number' ||
        typeof giftMessage !== 'string' ||
        typeof senderid !== 'string'
      ) {
        return res.status(400).json({ 
          error: 'gift must contain title(string), amount(number), giftMessage(string), and senderid(string)' 
        });
      }
  
      // 2. Verify Sender and Check Wallet Balance
      const sender = await userCollection.findOne({ userid: senderid });
      
      if (!sender) {
        return res.status(404).json({ error: 'Sender not found' });
      }
  
      if (sender.walletAmount < amount) {
        return res.status(400).json({ 
          error: `Insufficient funds. Your balance is ${sender.walletAmount}, but the gift costs ${amount}.` 
        });
      }
  
      // 3. Deduct from Sender's Wallet
      // We use $inc with a negative value to subtract
      await userCollection.updateOne(
        { userid: senderid },
        { $inc: { walletAmount: -amount } }
      );
  
      // 4. Add Gift to Recipient
      const giftWithId = { 
          ...gift, 
          id: uuidv4(), 
          date: new Date().toISOString() 
      };
  
      const result = await userCollection.findOneAndUpdate(
        { userid },
        { $push: { gifts: giftWithId } },
        { returnDocument: 'after' }
      );
  
      if (!result) {
        // Note: If this fails, the sender's money is already gone. 
        // In a production app, use a MongoDB Transaction to prevent this.
        return res.status(404).json({ error: 'Recipient not found' });
      }
  
      const { _id, ...data } = result;
      return res.status(200).json(data);
  
    } catch (error) {
      console.error('POST /addGift error:', error);
      return res.status(500).json({ error: 'Internal Server Error while adding gift' });
    }
  });

router.get('/getAllGiftsByUserId/:userid', async (req, res) => {
  try {
    const userCollection = await getUserCollection();
    const { userid } = req.params;
    const user = await userCollection.findOne({ userid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json(user.gifts || []);
  } catch (error) {
    console.error('GET /getAllGiftsByUserId error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/redeemGiftUserId', async (req, res) => {
  try {
    const userCollection = await getUserCollection();
    const { userid, giftId } = req.body;

    if (typeof userid !== 'string' || typeof giftId !== 'string') {
      return res.status(400).json({ error: 'userid(string) and giftId(string) are required' });
    }

    const user = await userCollection.findOne({ userid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const gift = (user.gifts || []).find(g => g.id === giftId);
    if (!gift) {
      return res.status(404).json({ error: 'Gift not found' });
    }

    const result = await userCollection.findOneAndUpdate(
      { userid },
      { 
        $inc: { walletBalance: gift.amount },
        $pull: { gifts: { id: giftId } }
      },
      { returnDocument: 'after' }
    );

    const { _id, ...data } = result;
    return res.status(200).json(data);
  } catch (error) {
    console.error('POST /redeemGiftUserId error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;