#!/bin/sh
set -eu

# Serialize schema updates through Wapo's PostgreSQL advisory lock before serving
# requests or processing jobs. One-off commands keep their original behavior.
if [ "$#" -eq 0 ] || [ "$1" = "worker" ]; then
  wapo migrate
fi

exec wapo "$@"
