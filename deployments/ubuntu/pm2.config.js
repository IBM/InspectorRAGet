// =============================================================================
// PM2 ecosystem config — InspectorRAGet Ubuntu deployment
//
// Usage:
//   pm2 start deployments/ubuntu/pm2.config.js
//   pm2 save
//   pm2 startup   (follow the printed command to enable auto-restart on reboot)
// =============================================================================

module.exports = {
  apps: [
    {
      name: 'inspectorraget',
      script: 'node_modules/.bin/next',
      args: 'start',

      // Run from the repo root
      cwd: '/home/ubuntu/InspectorRAGet',

      // Single instance — sufficient for a lightweight visualization app
      instances: 1,
      exec_mode: 'fork',

      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_TELEMETRY_DISABLED: '1',
      },

      // Restart policy
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000, // ms — wait before restarting on crash
      min_uptime: '10s', // must stay up 10s to count as a successful start

      // Memory limit — restart if the process exceeds 512 MB (safety net on 1 GB instance)
      max_memory_restart: '512M',

      // Logging
      out_file: '/home/ubuntu/logs/inspectorraget-out.log',
      error_file: '/home/ubuntu/logs/inspectorraget-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Graceful shutdown
      kill_timeout: 5000,
    },
  ],
};
