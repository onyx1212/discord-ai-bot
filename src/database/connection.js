const mongoose = require('mongoose');
const config = require('../config');
const { createContextLogger } = require('../utils/Logger');

const log = createContextLogger('Database');

let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

async function connect() {
  if (isConnected) return;

  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    isConnected = true;
    reconnectAttempts = 0;
    log.info('MongoDB connected successfully');
  });

  mongoose.connection.on('error', (err) => {
    log.error('MongoDB connection error', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    log.warn('MongoDB disconnected. Attempting reconnect...');
    scheduleReconnect();
  });

  mongoose.connection.on('reconnected', () => {
    isConnected = true;
    reconnectAttempts = 0;
    log.info('MongoDB reconnected');
  });

  try {
    await mongoose.connect(config.database.uri, {
      ...config.database.options,
      dbName: config.database.dbName,
    });
  } catch (err) {
    log.error('Initial MongoDB connection failed', { error: err.message });
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log.error('Max reconnection attempts reached. Giving up.');
    return;
  }
  reconnectAttempts++;
  const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
  log.info(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  setTimeout(async () => {
    try {
      await mongoose.connect(config.database.uri, {
        ...config.database.options,
        dbName: config.database.dbName,
      });
    } catch (err) {
      log.error('Reconnection attempt failed', { error: err.message });
      scheduleReconnect();
    }
  }, delay);
}

async function disconnect() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  log.info('MongoDB disconnected gracefully');
}

function getStatus() {
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  return {
    isConnected,
    state: states[mongoose.connection.readyState] || 'unknown',
    host: mongoose.connection.host,
    name: mongoose.connection.name,
  };
}

module.exports = { connect, disconnect, getStatus };
