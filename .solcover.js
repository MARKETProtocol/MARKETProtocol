module.exports = {
    skipFiles: ['Migrations.sol', 'mocks/OrderLibMock.sol', 'tokens/InitialAllocationCollateralToken.sol', 'tokens/CollateralToken.sol', 'tokens/UpgradeableTokenMock.sol' ],
    testCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle test --network coverage',
    compileCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle compile --network coverage',
    copyPackages: ['openzeppelin-solidity'],
    norpc: true
};
