<img src="https://image.ibb.co/mzSFa7/MARKET_logo_URL.png" align="middle">

[![Build Status](https://travis-ci.org/MARKETProtocol/MARKETProtocol.svg?branch=master)](https://travis-ci.org/MARKETProtocol/MARKETProtocol) [![Coverage Status](https://coveralls.io/repos/github/MARKETProtocol/MARKETProtocol/badge.svg?branch=master&service=github)](https://coveralls.io/github/MARKETProtocol/MARKETProtocol?branch=master)

MARKET Protocol provides the first opportunity for crypto holders to gain exposure to real-world or crypto assets through derivatives. A derivative is a contract between two parties with its value derived from an underlying asset. MARKET users will be able to design and implement contracts deriving value from digital and non-digital assets settling on the Ethereum blockchain. Users are not limited to owned or existing ERC20 tokens. MARKET is designed to facilitate risk transference and trading in a trustless manner.  Take a look at our [FAQ](https://github.com/MARKETProtocol/MARKETProtocol/wiki/Frequently-Asked-Questions) or [docs](http://docs.marketprotocol.io) for a little more explanation.

Join our [Discord Community](https://www.marketprotocol.io/discord) to interact with members of our dev staff and other contributors.

## Getting Started
Assuming you have npm already, Install truffle
```
$ npm install -g truffle
```

Clone this repository and use npm to install needed dependencies
```
$ git clone https://github.com/MARKETProtocol/MARKETProtocol.git
$ cd MARKETProtocol
$ npm install
```


## Tests
To run the tests locally via truffle you must have oraclize's bridge
running. Information on installation can be found [here](https://github.com/MARKETProtocol/ethereum-bridge)

Start truffle and its development blockhain with
```
$ truffle develop
```

and then start the ethereum bridge (in a separate console) to run connected
to the development blockchain you just started, note the account you use (in this example account 9 is used)

```
$ cd ethereum-bridge/
$ node bridge -H localhost:9545 -a 9 --dev
```

Once the bridge has fully initialized, you should be able to run the example migrations as well
as the accompanying tests inside the truffle console

```
truffle(develop)> migrate
truffle(develop)> test
```

If this fails due to a `revert` , please be sure the bridge is listening prior to attempting the migration.



## Contact us
We would love to hear your feedback and suggestions. We are also actively seeking community members who want to get involved in the project.  Please reach out to us at info@marketprotocol.io

