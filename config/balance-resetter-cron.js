require('dotenv').config();
const cron = require('node-cron');
const { exec } = require('child_process');

const {
  RESET_BALANCE,
  RESET_BALANCE_TIME,
  RESET_BALANCE_AMOUNT,
  RESET_AMOUNT_PRIVILEGED_USERS,
  RESET_AMOUNT_PRIVILEGED,
} = process.env;

// Function to run reset balance task
function resetBalances(callback) {
  const command = `npm run reset-balances -- -y ${RESET_BALANCE_AMOUNT}`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    if (stderr) {
      console.error(`stderr: ${stderr}`);
    }
    if (callback) {
      callback();
    }
  });
}

// Function to reset balance for privileged users
function resetBalanceForPrivilegedUsers() {
  const users = RESET_AMOUNT_PRIVILEGED_USERS.split(',');
  users.forEach((user) => {
    const command = `npm run reset-balance ${user} ${RESET_AMOUNT_PRIVILEGED}`;
    console.log(command);
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
    });
  });
}

// Check if RESET_BALANCE is true
if (RESET_BALANCE === 'true') {
  // Schedule the cron job
  const task = cron.schedule(RESET_BALANCE_TIME, () => {
    resetBalances(resetBalanceForPrivilegedUsers);
  });

  // Log when the cron job is scheduled
  task.start();
  console.log(`Cron job scheduled at ${RESET_BALANCE_TIME}`);
} else {
  console.log('Balance reset is disabled.');
}
