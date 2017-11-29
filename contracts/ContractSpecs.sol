pragma solidity ^0.4.0;

import "zeppelin-solidity/contracts/token/ERC20.sol";


contract ContractSpecs {

    string public CONTRACT_NAME;
    address public BASE_TOKEN_ADDRESS;
    ERC20 public BASE_TOKEN;
    uint public PRICE_CAP;
    uint public PRICE_FLOOR;
    uint public PRICE_DECIMAL_PLACES;   // how to convert the pricing from decimal format (if valid) to integer
    uint public QTY_DECIMAL_PLACES;     // how many tradeable units make up a whole pricing increment
    uint public EXPIRATION;

    /// @param contractName viewable name of this contract (BTC/ETH, LTC/ETH, etc)
    /// @param baseTokenAddress address of the ERC20 token that will be used for collateral and pricing
    /// @param contractSpecs array of unsigned integers including:
    /// floorPrice minimum tradeable price of this contract, contract enters settlement if breached
    /// capPrice maximum tradeable price of this contract, contract enters settlement if breached
    /// priceDecimalPlaces number of decimal places to convert our queried price from a floating point to
    /// an integer
    /// qtyDecimalPlaces decimal places to multiply traded qty by.
    /// expirationTimeStamp - seconds from epoch that this contract expires and enters settlement
    function ContractSpecs(
        string contractName,
        address baseTokenAddress,
        uint[5] contractSpecs
    ) public payable
    {
        PRICE_FLOOR = contractSpecs[0];
        PRICE_CAP = contractSpecs[1];
        PRICE_DECIMAL_PLACES = contractSpecs[2];
        QTY_DECIMAL_PLACES = contractSpecs[3];
        EXPIRATION = contractSpecs[4];
        CONTRACT_NAME = contractName;
        BASE_TOKEN_ADDRESS = baseTokenAddress;
        BASE_TOKEN = ERC20(baseTokenAddress);

        require(PRICE_CAP > PRICE_FLOOR);
        require(EXPIRATION > now);
    }
}
