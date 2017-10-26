pragma solidity ^0.4.0;

// Contract creators may be rewarded in the future with bounties or other special privileges.  Additionally
// creators may need to supply some needed gas reserves for the contract in order to facilitate settlement
// which could be recouped from contract participants upon settlement.
contract Creatable {

    address public creator;

    function Creatable(){
        creator = msg.sender;
    }

    event CreatorTransferred(address indexed currentCreator, address indexed newCreator);

    function transferCreator(address newCreator) onlyCreator public {
        require(newCreator != address(0));
        CreatorTransferred(creator, newCreator);
        creator = newCreator;
    }

    modifier onlyCreator() {
        require(msg.sender == creator);
        _;
    }
}

