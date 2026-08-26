#!/bin/sh
set -eu
umask 077

data_dir="${EASYNOTICE_DATA_DIR:-/app/data}"

protect_data_files() {
  chmod 700 "$data_dir" "$data_dir/uploads" 2>/dev/null || true
  find "$data_dir" -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null || true
  find "$data_dir/uploads" -type f -exec chmod 600 {} + 2>/dev/null || true
}

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$data_dir/uploads"
  chown -R node:node "$data_dir"
  protect_data_files
  exec gosu node "$@"
fi

mkdir -p "$data_dir/uploads"
protect_data_files
exec "$@"
