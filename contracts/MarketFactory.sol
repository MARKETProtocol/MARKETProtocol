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

//import "./MarketContract.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";


/// @title MarketFactory that creates market contracts and collects white listed addresses of contracts it has
/// deployed.  Currently this idea is pretty limited by deployment gas, so leave this as place holder for future
/// ideas.
/// @author Phil Elsasser <phil@marketprotcol.io>
contract MarketFactory is Ownable {

    mapping(address => bool) isWhiteListed; // by default currently all contracts are whitelisted
    address[] deployedAddresses;            // record of all deployed addresses;

    event MarketContractDeployed(address);

    function MarketFactory() public {

    }

    /// @notice deploys a market contract and adds the new address to the white list to allow trading
    /// @param contractName viewable name of this contract (BTC/ETH, LTC/ETH, etc)
    /// @param baseTokenAddress address of the ERC20 token that will be used for collateral and pricing
    /// @param oracleDataSource a data-source such as "URL", "WolframAlpha", "IPFS"
    /// see http://docs.oraclize.it/#ethereum-quick-start-simple-query
    /// @param oracleQuery see http://docs.oraclize.it/#ethereum-quick-start-simple-query for examples
    /// @param oracleQueryRepeatSeconds how often to repeat this callback to check for settlement, more frequent
    /// queries require more gas and may not be needed.
    /// @param floorPrice minimum tradeable price of this contract, contract enters settlement if breached
    /// @param capPrice maximum tradeable price of this contract, contract enters settlement if breached
    /// @param priceDecimalPlaces number of decimal places to convert our queried price from a floating point to
    /// an integer
    /// @param qtyDecimalPlaces decimal places to multiply traded qty by.
    /// @param secondsToExpiration - second from now that this contract expires and enters settlement
    function deployMarketContract (
        string contractName,
        address baseTokenAddress,
        string oracleDataSource,
        string oracleQuery,
        uint oracleQueryRepeatSeconds,
        uint floorPrice,
        uint capPrice,
        uint priceDecimalPlaces,
        uint qtyDecimalPlaces,
        uint secondsToExpiration
    ) external payable returns (address)
    {
//        // create market contract, forwarding amount payed to the constructor
//        // not that msg.sender in market contract will now be our address, so we need to
//        // ammend constructor to accept the address of the caller of THIS function as the creator
//        // of the contract.
//        MarketContract marketContract = (new MarketContract).value(msg.value)(
//             contractName,
//             baseTokenAddress,
//             oracleDataSource,
//             oracleQuery,
//             oracleQueryRepeatSeconds,
//             floorPrice,
//             capPrice,
//             priceDecimalPlaces,
//             qtyDecimalPlaces,
//             secondsToExpiration
//        );
//        isWhiteListed[address(marketContract)] = true;
//        deployedAddresses.push(address(marketContract));
//        MarketContractDeployed(address(marketContract));
//        return address(marketContract);
    }

    /// @notice determines if an address is a valid MarketContract
    /// @return false if the address has not been deployed by this factory, or is no longer white listed.
    function isAddressWhiteListed(address contractAddress) external view returns (bool) {
        return isWhiteListed[contractAddress];
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
        if (isWhiteListed[deployedAddress]) {
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
