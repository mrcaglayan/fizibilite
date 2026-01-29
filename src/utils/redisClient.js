const { createClient } = require("redis");

let redisClient = null;
let connecting = null;

async function getClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redisClient && redisClient.isReady) return redisClient;
  if (connecting) return connecting;

  const client = createClient({ url });
  client.on("error", (err) => {
    console.error("Redis error", err?.message || err);
  });

  connecting = client
    .connect()
    .then(() => {
      redisClient = client;
      return redisClient;
    })
    .catch((err) => {
      console.error("Redis connection failed", err?.message || err);
      redisClient = null;
      return null;
    })
    .finally(() => {
      connecting = null;
    });

  return connecting;
}

async function getJson(key) {
  try {
    const client = await getClient();
    if (!client) return null;
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("Redis getJson failed", err?.message || err);
    return null;
  }
}

async function setJson(key, value, { ttlSeconds } = {}) {
  try {
    const client = await getClient();
    if (!client) return null;
    const payload = JSON.stringify(value);
    if (ttlSeconds) {
      await client.set(key, payload, { EX: ttlSeconds });
    } else {
      await client.set(key, payload);
    }
    return true;
  } catch (err) {
    console.error("Redis setJson failed", err?.message || err);
    return null;
  }
}

async function del(key) {
  try {
    const client = await getClient();
    if (!client) return null;
    await client.del(key);
    return true;
  } catch (err) {
    console.error("Redis del failed", err?.message || err);
    return null;
  }
}

module.exports = {
  getJson,
  setJson,
  del,
};
