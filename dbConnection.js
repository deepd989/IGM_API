const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
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




module.exports = {
getDbClient
};