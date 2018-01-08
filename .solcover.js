module.exports = {
    skipFiles: ['oraclize/oraclizeAPI.sol', 'Migrations.sol' ],
    testCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle test --network coverage',
    compileCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle compile --network coverage',
    copyPackages: ['zeppelin-solidity'],
    norpc: true
};
