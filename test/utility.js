module.exports => {
  const utility = {};
  utility.signMessage = function signMessage(web3, address, message) {
    var signature = web3.eth.sign(address, message);
    var r = signature.slice(0, 66);
    var s = `0x${signature.slice(66, 130)}`;
    var v = web3.toDecimal(`0x${signature.slice(130, 132)}`);
    if (v !== 27 && v !== 28) v += 27;
    return [v,r,s];
  };
  return utility;
}