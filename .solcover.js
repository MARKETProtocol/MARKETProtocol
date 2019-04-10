module.exports = {
    skipFiles: ['oraclize/oraclizeAPI.sol', 'Migrations.sol', 'oraclize/OraclizeQueryTest.sol', 'mocks/OrderLibMock.sol' ],
    testCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle test --network coverage',
    compileCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle compile --network coverage',
    copyPackages: ['openzeppelin-solidity'],
    norpc: true
};
