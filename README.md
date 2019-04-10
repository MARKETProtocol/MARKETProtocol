![MARKET Protocol](assets/MARKETProtocol-Dark.png?raw=true)


[![Build Status](https://travis-ci.org/MARKETProtocol/MARKETProtocol.svg?branch=master)](https://travis-ci.org/MARKETProtocol/MARKETProtocol) [![Coverage Status](https://coveralls.io/repos/github/MARKETProtocol/MARKETProtocol/badge.svg?branch=master&service=github)](https://coveralls.io/github/MARKETProtocol/MARKETProtocol?branch=master) [![npm version](https://badge.fury.io/js/%40marketprotocol%2Fmarketprotocol.svg)](https://badge.fury.io/js/%40marketprotocol%2Fmarketprotocol)

MARKET Protocol has been created to provide a secure, flexible, open source foundation for decentralized trading on the Ethereum blockchain. We provide the pieces necessary to create a decentralized exchange, including the requisite clearing and collateral pool infrastructure, enabling third parties to build applications for trading. Take a look at our [FAQ](https://docs.marketprotocol.io/#faq-general) or [docs](https://docs.marketprotocol.io) for a little more explanation.

Join our [Discord Community](https://marketprotocol.io/discord) to interact with members of our dev staff and other contributors.

## Dependencies
This project uses Node.js version 8.10.0 - 8.11.3.

If you are running multiple versions of Node.js, consider using [Node Version Manager](https://github.com/creationix/nvm) (nvm). nvm is an easy way to configure and manage different Node.js versions to work with your projects.

## Getting Started

A Makefile is provided for easy setup of the environment.

Some pre-requisites are required in order to utilize the Makefile.

```
$ git clone https://github.com/MARKETProtocol/MARKETProtocol.git  # clone this repository
```
From here you will be able to use make commands assuming npm is already installed.

Assuming you have npm already, Install truffle
```
$ make install_truffle
```

Clone this repository and use npm to install needed dependencies
```
$ git clone https://github.com/MARKETProtocol/MARKETProtocol.git
$ cd MARKETProtocol
$ make install_deps
```
If you get an error on the `node-gyp rebuild` line during `make install_deps`, `node-gyp` doesn't support Python v3.x.x; v2.7 is recommended. There are several solutions based upon your platform.

The easiest solution? Use `make install_deps_python2.7` to use Python 2.7, see [stack overflow](https://stackoverflow.com/questions/20454199/how-to-use-a-different-version-of-python-during-npm-install) or the [npm node-gyp project](https://github.com/nodejs/node-gyp) for details.


## Tests

Start truffle and its development blockchain with
```
$ make start_console
```

Run the example migrations as well as the accompanying tests inside the truffle console

```
truffle(develop)> migrate --reset
truffle(develop)> test
```

### Running tests with coverage enabled

The most convenient way to run tests with coverage enabled is to run them with help of Docker orchestration. This ensures, that the coverage results will match the ones on Travis CI.

#### Prerequisites

##### Docker and docker-compose

Instructions on how to install both applications are available at  [docker](https://docs.docker.com/install/) and [docker-compose ](https://docs.docker.com/compose/install/) websites. When the applications are installed please make sure that the current user is added to 'docker' group.

#### Environment variables

Docker images use four environment variables that point to host and port on test and coverage Ethereum networks, please export them to your shell environment:

TRUFFLE_DEVELOP_HOST=truffle
TRUFFLE_DEVELOP_PORT=9545
TRUFFLE_COVERAGE_HOST=truffle-coverage
TRUFFLE_COVERAGE_PORT=8555

### Running tests

#### Start containers

```
docker-compose up
```

The first run will take a while since images will be pulled from Docker registry. After that images are cached and the start will be much faster.
Make sure that all four environment variables are available in the second shell.

```
TRUFFLE_DEVELOP_HOST=truffle
TRUFFLE_DEVELOP_PORT=9545
TRUFFLE_COVERAGE_HOST=truffle-coverage
TRUFFLE_COVERAGE_PORT=8555
```


#### Start tests

To run tests:
```
docker-compose exec truffle truffle test
```

If you want to run test with coverage:

```
docker-compose exec truffle-coverage env CONTINUOUS_INTEGRATION=true scripts/coverage_run.sh
```


## Solium

### To run `solium` on the solidity smart contracts
ensure you have solium installed with `solium -V` if not install
```
$ npm install -g solium
```
and then
```
$ solium --dir ./
```

## Contributing

Want to hack on MARKET Protocol? Awesome!

MARKET Protocol is an Open Source project and we welcome contributions of all sorts. There are many ways to help, from reporting issues, contributing code, and helping us improve our community.

Ready to jump in? Check [docs.marketprotocol.io/#contributing](https://docs.marketprotocol.io/#contributing).

## Questions?

Join our [Discord Community](https://marketprotocol.io/discord) to get in touch with our dev staff and other contributors.
