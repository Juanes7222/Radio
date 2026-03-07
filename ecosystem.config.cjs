/** @type {import('pm2').StartOptions[]} */
module.exports = {
  apps: [
    {
      name: "radio-backend",
      script: "./dist/index.js",
      cwd: "/var/www/radio/backend",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
      env_file: "/var/www/radio/backend/.env",
      error_file: "/var/log/pm2/radio-backend-error.log",
      out_file: "/var/log/pm2/radio-backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
