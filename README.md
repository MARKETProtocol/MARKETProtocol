<img src="https://github.com/MARKETProtocol/dApp/blob/master/src/img/MARKETProtocol-Light.png?raw=true" align="middle">


[![Build Status](https://travis-ci.org/MARKETProtocol/MARKETProtocol.svg?branch=master)](https://travis-ci.org/MARKETProtocol/MARKETProtocol) [![Coverage Status](https://coveralls.io/repos/github/MARKETProtocol/MARKETProtocol/badge.svg?branch=master&service=github)](https://coveralls.io/github/MARKETProtocol/MARKETProtocol?branch=master)

MARKET Protocol has been created to provide a secure, flexible, open source foundation for decentralized trading on the Ethereum blockchain. We provide the pieces necessary to create a decentralized exchange, including the requisite clearing and collateral pool infrastructure, enabling third parties to build applications for trading. Take a look at our [FAQ](https://github.com/MARKETProtocol/MARKETProtocol/wiki/Frequently-Asked-Questions) or [docs](http://docs.marketprotocol.io) for a little more explanation.

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
If you get an error on the `node-gyp rebuild` line during `npm install`, `node-gyp` doesn't support Python v3.x.x; v2.7 is recommended. There are several solutions based upon your platform.

The easiest solution? Use `npm install --python=python2.7` above to specify the Python version, see [stack overflow](https://stackoverflow.com/questions/20454199/how-to-use-a-different-version-of-python-during-npm-install) or the [npm node-gyp project](https://github.com/nodejs/node-gyp) for details.



## Tests
To run the tests locally via truffle you must have oraclize's bridge
running. Information on installation can be found [here](https://github.com/MARKETProtocol/ethereum-bridge)

Start truffle and its development blockchain with
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

Join our [Discord Community](https://www.marketprotocol.io/discord) to get in touch with our dev staff and other contributors.
