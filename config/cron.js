require('dotenv').config();
const cron = require('node-cron');
const { resetBalancesCallback } = require('./reset-balances-auto.js'); // Update the path accordingly

const { RESET_BALANCE, RESET_BALANCE_TIME } = process.env;

// Check if RESET_BALANCE is true
if (RESET_BALANCE === 'true') {
  // Schedule the cron job
  const task = cron.schedule(RESET_BALANCE_TIME, () => {
    resetBalancesCallback();
  });

  // Log when the cron job is scheduled
  task.start();
  console.log(`Cron job scheduled at ${RESET_BALANCE_TIME}`);
} else {
  console.log('Balance reset is disabled.');
}
