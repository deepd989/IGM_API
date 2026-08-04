const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_DB_URI;
const dbName = process.env.MONGO_DB_NAME
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
 * Get a database by name. Defaults to MONGO_DB_NAME — the connection string
 * carries no default database, so client.db() with no argument would land on
 * "test" instead.
 */
async function getDb(name = dbName) {
  const cli = await getDbClient();
  return cli.db(name);
}

/**
 * Get a collection from the MONGO_DB_NAME database.
 */
async function getCollection(collectionName) {
  const database = await getDb();
  return database.collection(collectionName);
}

/**
 * Gracefully close the connection (used by one-off scripts so node can exit).
 */
async function closeDb() {
  if (client) {
    await client.close();
    client = undefined;
    clientPromise = undefined;
  }
}

async function getUserCollection() {
  return getCollection('users');
}




module.exports = {
getDbClient,
getDb,
getCollection,
closeDb,
getUserCollection ,
};
