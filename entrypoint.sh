#!/bin/ash

# Running the Node.js script at startup
echo "Running the balance reset script..."
node ./config/balance-resetter-cron.js

. ./.env

# Set up a cron job
echo "Setting up a cron job..."
echo "${RESET_BALANCE_TIME} node ./config/balance-resetter-cron.js" >> /etc/crontabs/root

# Start the cron daemon
crond -l 2 -f
