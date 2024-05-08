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
  console.purple('Reset balance of a specific user account!');
  console.purple('--------------------------');

  // Get arguments if provided
  let email = process.argv[2];
  let newBalance = parseFloat(process.argv[3]);

  if (!email) {
    email = await askQuestion('Please enter the email of the user:');
    if (!email.includes('@')) {
      console.red('Error: Invalid email address!');
      silentExit(1);
    }
  }

  if (isNaN(newBalance)) {
    let balanceInput = await askQuestion('Please enter the new balance:');
    newBalance = parseFloat(balanceInput);
    if (isNaN(newBalance)) {
      console.red('Error: Invalid balance amount!');
      silentExit(1);
    }
  }

  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.red('Error: No user with that email was found!');
    silentExit(1);
  } else {
    await resetAndSetBalance(user, newBalance);
    console.green(`Balance for ${email} successfully reset to ${newBalance}`);
    silentExit(0);
  }
})();

async function resetAndSetBalance(user, newBalance) {
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
}

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:', err);
  process.exit(1);
});
