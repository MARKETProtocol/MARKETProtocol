#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

start_truffle() {
    truffle develop
}

echo "Starting our truffle instance"
start_truffle
