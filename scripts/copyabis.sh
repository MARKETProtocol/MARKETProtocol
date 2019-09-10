#!/bin/bash

copy_abi () {
  rm -v ../abis/build/contracts/$1
  cp -v build/contracts/$1 ../abis/build/contracts/$1
}

copy_abi "MarketCollateralPool.json"
copy_abi "MarketContractFactoryMPX.json"
copy_abi "MarketContract.json"
copy_abi "MarketContractMPX.json"
copy_abi "MarketContractRegistry.json"
copy_abi "MarketToken.json"
copy_abi "MathLib.json"
copy_abi "Migrations.json"

