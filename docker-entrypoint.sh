#!/bin/sh
set -eu

data_dir="${EASYNOTICE_DATA_DIR:-/app/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$data_dir/uploads"
  chown -R node:node "$data_dir"
  umask 077
  exec gosu node "$@"
fi

mkdir -p "$data_dir/uploads"
exec "$@"
