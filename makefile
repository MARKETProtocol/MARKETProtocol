# useful commands for MARKETProtocol/MARKETProtocol
#

# prerequisites
#   mkdir $(DEV)/MARKETProtocol
#   cd $(DEV)/MARKETProtocol
#   git clone https://github.com/MARKETProtocol/MARKETProtocol.git

# default target
default:
	pwd

# install truffle
install_truffle:
	npm install -g truffle@4.1.15

# install required dependencies
install_deps:
	npm install # for MARKETProtocol

install_deps_python2.7:
	npm install --python=python2.7 # for MARKETProtocol with python 2.7

# open truffle console with a local development blockchain
start_console:
	truffle develop

#
# truffle console commands
#
#   migrate
#   test
#
