module.exports = {
  apps: [
    {
      name: 'discord-ai-bot',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 5000,
      max_restarts: 20,
      min_uptime: '10s',

      env: {
        NODE_ENV: 'development',
      },

      env_production: {
        NODE_ENV: 'production',
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      log_type: 'json',

      kill_timeout: 5000,
      shutdown_with_message: true,
      listen_timeout: 10000,

      node_args: [
        '--max-old-space-size=512',
        '--gc-interval=100',
      ],
    },
  ],
};
