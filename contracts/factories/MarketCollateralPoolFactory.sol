/*
    Copyright 2017-2018 Phillip A. Elsasser

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

pragma solidity ^0.4.24;

import "../MarketCollateralPool.sol";
import "./MarketCollateralPoolFactoryInterface.sol";
import "../MarketContractRegistryInterface.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";


contract MarketCollateralPoolFactory is Ownable, MarketCollateralPoolFactoryInterface {

    address public marketContractRegistry;

    /// @dev deploys our factory and ties it the a supply registry address
    /// @param registryAddress - MarketContractRegistry address to whitelist contracts
    constructor(address registryAddress) public {
        marketContractRegistry = registryAddress;

    }

    /// @dev creates the needed collateral pool and links it to our market contract.
    /// @param marketContractAddress address of the newly deployed market contract.
    function deployMarketCollateralPool(address marketContractAddress) external {
        require(MarketContractRegistryInterface(marketContractRegistry).isAddressWhiteListed(marketContractAddress));
        MarketCollateralPool marketCollateralPool = new MarketCollateralPool(marketContractAddress);
        MarketContract(marketContractAddress).setCollateralPoolContractAddress(marketCollateralPool);
    }

    /// @dev allows for the owner to set the desired registry for contract creation.
    /// @param registryAddress desired registry address.
    function setRegistryAddress(address registryAddress) external onlyOwner {
        require(registryAddress != address(0));
        marketContractRegistry = registryAddress;
    }
}
