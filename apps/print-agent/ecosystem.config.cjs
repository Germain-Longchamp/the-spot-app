// PM2 keeps the agent running. Installed on the salon computer by SCRUM-42,
// with `pm2 startup` for the boot and pm2-logrotate for the log rotation.
module.exports = {
  apps: [
    {
      name: "the-spot-print-agent",
      script: "dist/index.js",
      node_args: "--env-file=.env",
      autorestart: true,
      restart_delay: 2000,
      // Lets a print in progress finish and report before PM2 kills the agent.
      kill_timeout: 30000,
    },
  ],
};
