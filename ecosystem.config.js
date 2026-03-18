module.exports = {
  apps: [
    {
      name: 'jma-machine',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      watch: false,
    },
    // {
    //   name: 'jma-tunnel',
    //   script: 'scripts/tunnel.js',
    //   cwd: __dirname,
    //   instances: 1,
    //   exec_mode: 'fork',
    //   env: {
    //     NODE_ENV: 'development',
    //   },
    //   watch: false,
    // },
  ],
};

