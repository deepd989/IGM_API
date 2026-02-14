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
      console.log('Received addGift request:', req.body);
  
      if (typeof gift !== 'object' || gift === null) {
        return res.status(400).json({ error: 'gift must be a non-null object' });
      }
  
      const { title, amount, giftMessage, receiverid,date } = gift;
  
      if (
        typeof userid !== 'string' ||
        typeof title !== 'string' ||
        typeof amount !== 'number' ||
        typeof giftMessage !== 'string' ||
        typeof receiverid !== 'string' || 
        typeof date !== 'string'
      ) {
        return res.status(400).json({ 
          error: 'gift must contain title(string), amount(number), giftMessage(string), and receiver(string)' 
        });
      }

      if(userid === receiverid){
        return res.status(400).json({ 
          error: 'Sender and receiver cannot be the same user.' 
        });
      }
  
      // 2. Verify Sender and Check Wallet Balance
      const sender = await userCollection.findOne({ userid });
      
      if (!sender) {
        return res.status(404).json({ error: 'Sender not found' });
      }
  
      if (!sender.walletBalance || sender.walletBalance < amount) {
        return res.status(400).json({ 
          error: `Insufficient funds. Your balance is ${sender.walletBalance}, but the gift costs ${amount}.` 
        });
      }
     
  
      // 4. Add Gift to Recipient
      const giftWithId = { 
          ...gift, 
          id: uuidv4(), 
          type: "IGM Gift Card",
          status:"unclaimed",
      };

      const result = await userCollection.findOneAndUpdate(
        { userid: receiverid },
        { 
          // Fields to set ONLY if the document is being created for the first time
          $setOnInsert: { 
            userid: receiverid, 
            walletBalance: 0 
          },
          // Action to perform regardless of whether it's new or existing
          $push: { gifts: giftWithId } 
        },
        { 
          upsert: true, 
          returnDocument: 'after' 
        }
      );
      
  
      if (!result) {
        return res.status(404).json({ error: 'Recipient not found' });
      }
      await userCollection.updateOne(
        { userid },
        { $inc: { walletBalance: -amount } }
      );
  
      const { _id, ...data } = result;
      return res.status(200).json(data);
  
    } catch (error) {
      console.error('POST /addGift error:', error);
      return res.status(500).json({ error: 'Internal Server Error while adding gift' });
    }
  });



router.post('/redeemGiftUserId', async (req, res) => {
  try {
    const userCollection = await getUserCollection();
    const { userid, giftid } = req.body;

    if (typeof userid !== 'string' || typeof giftid !== 'string') {
      return res.status(400).json({ error: 'userid(string) and giftId(string) are required' });
    }

    const user = await userCollection.findOne({ userid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const gift = (user.gifts || []).find(g => g.id === giftid);
    if (!gift) {
      return res.status(404).json({ error: 'Gift not found' });
    }

    const result = await userCollection.findOneAndUpdate(
      { userid },
      { 
        $inc: { walletBalance: gift.amount },
        $pull: { gifts: { id: giftid } }
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