module.exports = {
  signMessage: function (web3, address, message) {
    var signature = web3.eth.sign(address, message);
    var r = signature.slice(0, 66);
    var s = `0x${signature.slice(66, 130)}`;
    var v = web3.toDecimal(`0x${signature.slice(130, 132)}`);
    if (v !== 27 && v !== 28) v += 27;
    return [v,r,s];
  },

  /**
   * Returns a promise that resolves to the next set of events of eventName publish by the contract
   *
   * @param contract
   * @param eventName
   * @return {Promise}
   */
  getEvent(contract, eventName) {
    return new Promise((resolve, reject) => {
      const event = contract[eventName]();
      event.get((error, logs) => {
        if (error) {
          return reject(error)
        }
        return resolve(logs)
      });
    });
  }
}