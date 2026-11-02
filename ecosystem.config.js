/**
 * PM2 process for the live server. One instance in fork mode: Socket.io live chat needs the Redis
 * adapter before it can run on several processes. Settings come from the server's .env, not from here.
 */
module.exports = {
  apps: [
    {
      name: "onevaya-api",
      cwd: "/var/www/onevaya-api/current",
      script: "dist/server.js",
      exec_mode: "fork",
      instances: 1,
      kill_timeout: 10000,
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "1G",
      env: { NODE_ENV: "production" },
    },
  ],
};
