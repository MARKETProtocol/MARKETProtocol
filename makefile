# useful commands for MARKETProtocol/MARKETProtocol
#

# prerequisites
#   mkdir $(DEV)/MARKETProtocol
#   cd $(DEV)/MARKETProtocol
#   git clone https://github.com/MARKETProtocol/MARKETProtocol.git
#   git clone https://github.com/MARKETProtocol/ethereum-bridge.git

# path to oraclize/ethereum-bridge
EB_PATH=../ethereum-bridge

# default target
default:
	pwd

# install truffle
install_truffle:
	npm install -g truffle

# install required dependencies
install_deps:
	npm install # for MARKETProtocol
	cd $(EB_PATH) ; npm install # for ethereum-bridge

install_deps_python2.7:
	npm install --python=python2.7 # for MARKETProtocol with python 2.7
	cd $(EB_PATH) ; npm install # for ethereum-bridge


# open truffle console with a local development blockchain
start_console:
	truffle develop

# start ethereum bridge
start_bridge:
	cd $(EB_PATH) ; node bridge -H localhost:9545 -a 9 --dev

#
# truffle console commands
#
#   migrate
#   test
#
