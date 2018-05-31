#!/usr/bin/env bash

# if we are on master and it has a tag, prepare build artifacts for npm package
if [ "$TRAVIS_BRANCH" = "master" ] && [[ -v TRAVIS_TAG ]]; then
  npm install
  npm install -g truffle
  truffle compile --all
fi