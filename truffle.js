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
      gasPrice: 0x01,
    }
 }
}
