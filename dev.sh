#!/bin/bash
set -e

cd "$(dirname "$0")/app"
npm run tauri dev
