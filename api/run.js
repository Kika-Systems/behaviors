'use strict';
const config = require('./conf');
const initServer = require('./server');

initServer(config).catch(error => {
  console.error(
    `Fatal error occurred when attempting to start up the behavior api server`
  );
  console.error(error);
  process.exit(1);
});
