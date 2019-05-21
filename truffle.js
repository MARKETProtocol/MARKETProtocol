module.exports = {
  networks: {
    development: {
      host: process.env.TRUFFLE_DEVELOP_HOST || 'localhost',
      port: process.env.TRUFFLE_DEVELOP_PORT || 9545,
      network_id: '*' // Match any network id
    },
    coverage: {
      host: 'truffle-coverage',
      network_id: '*', // eslint-disable-line camelcase
      port: 8555,
      gas: 0xfffffffffff,
      gasPrice: 0x01
    },
    ganache: {
      host: 'localhost',
      port: 7545,
      network_id: '*' // Match any network id
    }
  },
  compilers: {
    solc: {
      version: '0.5.2',
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
};
