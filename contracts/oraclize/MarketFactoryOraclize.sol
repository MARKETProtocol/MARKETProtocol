/*
    Copyright 2017 Phillip A. Elsasser

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

pragma solidity 0.4.18;

import "./MarketContractOraclize.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";


/// @title MarketFactory that creates market contracts and collects white listed addresses of contracts it has
/// deployed.  Currently this idea is pretty limited by deployment gas, so leave this as place holder for future
/// ideas.
/// @author Phil Elsasser <phil@marketprotcol.io>
contract MarketFactoryOraclize is Ownable {

    address public MKT_TOKEN_ADDRESS;

    mapping(address => bool) isWhiteListed; // by default currently all contracts are whitelisted
    address[] deployedAddresses;            // record of all deployed addresses;

    event MarketContractDeployed(address indexed marketContractAddress);

    function MarketFactoryOraclize(address marketTokenAddress) public {
        MKT_TOKEN_ADDRESS = marketTokenAddress;
    }

    /// @notice deploys a market contract and adds the new address to the white list to allow trading
    /// @param contractName viewable name of this contract (BTC/ETH, LTC/ETH, etc)
    /// @param baseTokenAddress address of the ERC20 token that will be used for collateral and pricing
    /// @param contractSpecs array of unsigned integers including:
    /// floorPrice minimum tradeable price of this contract, contract enters settlement if breached
    /// capPrice maximum tradeable price of this contract, contract enters settlement if breached
    /// priceDecimalPlaces number of decimal places to convert our queried price from a floating point to
    /// an integer
    /// qtyDecimalPlaces decimal places to multiply traded qty by.
    /// expirationTimeStamp - seconds from epoch that this contract expires and enters settlement
    /// @param oracleDataSource a data-source such as "URL", "WolframAlpha", "IPFS"
    /// see http://docs.oraclize.it/#ethereum-quick-start-simple-query
    /// @param oracleQuery see http://docs.oraclize.it/#ethereum-quick-start-simple-query for examples
    /// @param oracleQueryRepeatSeconds how often to repeat this callback to check for settlement, more frequent
    /// queries require more gas and may not be needed.
    function deployMarketContractOraclize (
        string contractName,
        address baseTokenAddress,
        uint[5] contractSpecs,
        string oracleDataSource,
        string oracleQuery,
        uint oracleQueryRepeatSeconds
    ) external payable returns (address)
    {
        // create market contract, forwarding amount payed to the constructor
        // not that msg.sender in market contract will now be our address, so we need to
        // ammend constructor to accept the address of the caller of THIS function as the creator
        // of the contract.
        MarketContractOraclize marketContract = (new MarketContractOraclize).value(msg.value)(
            contractName,
            MKT_TOKEN_ADDRESS,
            baseTokenAddress,
            contractSpecs,
            oracleDataSource,
            oracleQuery,
            oracleQueryRepeatSeconds
        );

        isWhiteListed[marketContract] = true;
        deployedAddresses.push(marketContract);
        MarketContractDeployed(marketContract);
        return marketContract;
    }

    /// @notice determines if an address is a valid MarketContract
    /// @return false if the address has not been deployed by this factory, or is no longer white listed.
    function isAddressWhiteListed(address contractAddress) public view returns (bool) {
        return isWhiteListed[contractAddress] &&
            MarketContractOraclize(contractAddress).isCollateralPoolContractLinked();
    }

    /// @notice the current number of contracts that have been deployed by this factory.
    function getDeployedAddressesLength() external view returns (uint) {
        return deployedAddresses.length;
    }

    /// @notice allows user to get all addresses currently available from this factory
    /// @param index of the deployed contract to return the address
    /// @return address of a white listed contract, or if contract is no longer valid address(0) is returned.
    function getAddressByIndex(uint index) external view returns (address) {
        address deployedAddress = deployedAddresses[index];
        if (isAddressWhiteListed(deployedAddress)) {
            return deployedAddress;
        } else {
            return address(0);
        }
    }

    /// @dev allows for the owner to remove a white listed contract, eventually ownership could transition to
    /// a decentralized smart contract of community members to vote
    /// @param contractAddress contract to removed from white list
    function removeContractFromWhiteList(address contractAddress) external onlyOwner returns (bool) {
        isWhiteListed[contractAddress] = false;
    }
}
