#!/bin/sh
set -eu

cp .env.example .env
sed -i.bak 's/^REQUEST_LOG_SAMPLE_RATE=.*/REQUEST_LOG_SAMPLE_RATE=1/' .env
sed -i.bak 's/^LOGIN_RATE_LIMIT_PER_MINUTE=.*/LOGIN_RATE_LIMIT_PER_MINUTE=100/' .env
rm -f .env.bak
{
  echo "BOOTSTRAP_API_KEY=$(openssl rand -hex 32)"
  echo "ADMIN_API_KEY=$(openssl rand -hex 32)"
  echo "ADMIN_PASSWORD=$(openssl rand -hex 24)"
  echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
} >> .env
