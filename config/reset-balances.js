const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const { Transaction } = require('~/models/Transaction');
const User = require('~/models/User');
const Balance = require('~/models/Balance');
const connect = require('./connect');

(async () => {
  await connect();

  console.purple('--------------------------');
  console.purple('Reset and set balance of user accounts!');
  console.purple('--------------------------');

  // Command line arguments handling
  const args = process.argv.slice(2);

  const newBalanceInput = args.find((arg) => /^[0-9]+(\.[0-9]+)?$/.test(arg));
  const force = args.includes('-y');

  if (!process.env.CHECK_BALANCE) {
    console.red(
      'Error: CHECK_BALANCE environment variable is not set! Configure it to use it: `CHECK_BALANCE=true`',
    );
    silentExit(1);
  }

  if (!newBalanceInput) {
    console.red('Error: No balance amount provided!');
    silentExit(1);
  }

  const newBalance = parseFloat(newBalanceInput);

  if (!force) {
    const confirm = await askQuestion(
      'Are you sure you want to reset the balance for all users? (yes/no):',
    );
    if (confirm.toLowerCase() !== 'yes') {
      console.purple('Operation cancelled.');
      silentExit(0);
    }
  }

  const users = await User.find({}).lean();
  for (const user of users) {
    await resetAndSetBalance(user, newBalance);
  }

  silentExit(0);
})();

async function resetAndSetBalance(user, newBalance) {
  console.purple(`Processing user: ${user.email}`);
  const currentBalanceRecord = await Balance.findOne({ user: user._id });
  const currentBalance = currentBalanceRecord ? currentBalanceRecord.tokenCredits : 0;

  // Reset transaction to zero out the balance
  await Transaction.create({
    user: user._id,
    tokenType: 'credits',
    context: 'admin',
    rawAmount: -currentBalance, // Subtract the current balance
  });

  // Set the new balance
  await Transaction.create({
    user: user._id,
    tokenType: 'credits',
    context: 'admin',
    rawAmount: newBalance, // Set to the new balance
  });

  console.green(`Balance for ${user.email} reset and set to ${newBalance}`);
}

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:', err);
  process.exit(1);
});
