require('dotenv').config();
const { exec } = require('child_process');
const { program } = require('commander');

const { RESET_BALANCE_AMOUNT, RESET_AMOUNT_PRIVILEGED_USERS, RESET_AMOUNT_PRIVILEGED } =
  process.env;

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

// Command-line interface setup
program
  .command('reset')
  .description('Reset balances')
  .action(() => {
    resetBalances(resetBalanceForPrivilegedUsers);
  });

program
  .command('reset-privileged')
  .description('Reset balances for privileged users')
  .action(() => {
    resetBalanceForPrivilegedUsers();
  });

function resetBalancesCallback() {
  resetBalances(resetBalanceForPrivilegedUsers);
}

// Export functions for external use
module.exports = {
  resetBalancesCallback,
};

// If the file is executed directly, process the CLI arguments
if (require.main === module) {
  resetBalancesCallback();
}
