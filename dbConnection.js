const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_DB_URI;
const dbName = process.env.MONGO_DB_NAME 
console.log('MongoDB URI:', uri); // Debugging line
if (!uri || !dbName) {
  throw new Error("Please define the MONGO_DB_URI environment variable");
}

const options = {
  // Adjust as needed
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
};

let client;
let clientPromise;

/**
 * Get a connected MongoClient (singleton across imports).
 */
async function getDbClient() {
  if (client && client.topology?.isConnected()) return client;

  if (!clientPromise) {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }

  try {
    await clientPromise;
    return client;
  } catch (err) {
    clientPromise = undefined;
    client = undefined;
    throw err;
  }
}

/**
 * Get a specific database by name. Defaults to "test".
 */
async function getDb(dbName = "test") {
  const cli = await getDbClient();
  return cli.db(dbName);
}

/**
 * Gracefully close the connection (optional).
 */
async function closeDb() {
  if (client) {
    await client.close();
    client = undefined;
    clientPromise = undefined;
  }
}

async function getUserCollection() {
    const dbClient = await getDbClient();
const database = dbClient.db(dbName);
const userCollection = database.collection('users');
return userCollection;}




module.exports = {
getDbClient,
getUserCollection ,
};