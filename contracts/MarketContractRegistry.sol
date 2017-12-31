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

import "./MarketContract.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";


contract MarketContractRegistry is Ownable {

    mapping(address => bool) isWhiteListed;
    address[] addressWhiteList;            // record of currently deployed addresses;

    /// @notice determines if an address is a valid MarketContract
    /// @return false if the address is not white listed.
    function isAddressWhiteListed(address contractAddress) external view returns (bool) {
        return isWhiteListed[contractAddress];
    }

    /// @notice all currently whitelisted addresses
    /// returns array of addresses
    function getAddressWhiteList() external view returns (address[]) {
        return addressWhiteList;
    }

    /// @dev allows for the owner to remove a white listed contract, eventually ownership could transition to
    /// a decentralized smart contract of community members to vote
    /// @param contractAddress contract to removed from white list
    /// @param whiteListIndex of the contractAddress in the addressWhiteList to be removed.
    function removeContractFromWhiteList(address contractAddress, uint whiteListIndex) external onlyOwner returns (bool) {
        require(isWhiteListed[contractAddress]);
        require(addressWhiteList[whiteListIndex] == contractAddress);
        isWhiteListed[contractAddress] = false;

        // push the last item in array to replace the address we are removing and then trim the array.
        addressWhiteList[whiteListIndex] = addressWhiteList[addressWhiteList.length - 1];
        addressWhiteList.length -= 1;
    }

    /// @dev allows for the owner to add a white listed contract, eventually ownership could transition to
    /// a decentralized smart contract of community members to vote
    /// @param contractAddress contract to removed from white list
    function addAddressToWhiteList(address contractAddress) external onlyOwner {
        require(!isWhiteListed[contractAddress]);
        require(MarketContract(contractAddress).isCollateralPoolContractLinked());
        isWhiteListed[contractAddress] = true;
        addressWhiteList.push(contractAddress);
    }
}
