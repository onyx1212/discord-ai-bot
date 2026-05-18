const { createContextLogger } = require('../utils/Logger');
const Security = require('../security/SecurityManager');

const log = createContextLogger('Error');

module.exports = {
  name: 'error',
  once: false,

  async execute(client, error) {
    const safeMessage = Security.maskToken(Security.maskApiKey(error.message || String(error)));
    log.error('Discord client error', { error: safeMessage, code: error.code });
  },
};
