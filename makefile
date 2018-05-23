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

# PoC for automated versioning

## versioning

# use this section of the makefile to
#   create a new npm package version number
#   create a tag in git reflecting the new version
#   create a new draft release in github
#   edit/annotate the draft to produce a final release
#
GH_OWNER=MARKETProtocol
GH_REPO=MARKETProtocol

# prereq
prereq:
	npm install semver

# automatically increment and apply new patch, minor or major release versions
version_patch: test
	npm version patch --git-tag-version

version_minor: test
	npm version minor --git-tag-version

version_major: test
	npm version major --git-tag-version

# push the version tag(s) created above
push_tags:
	git push --tags

# list versions
list_version:
	git tag

# extract the new version string from the package file
VERSION=v`node -pe "require('./package.json').version"`

# release a *draft* of the new version to github
#   visit https://github.com/MARKETProtocol/MARKETProtocol/releases to finalize the draft
#
# note: this requires an access token, GITHUB_API_TOKEN set in the environment
#   to generate, see https://github.com/settings/tokens/new
release:
	echo "{ \"tag_name\": \"$(VERSION)\", \"target_commitish\": \"master\", \"name\": \"$(VERSION)\", \"body\": \"[release description]\", \"draft\": true, \"prerelease\": true}" > release.json
	curl -H "Authorization: token ${GITHUB_API_TOKEN}" -H "Content-Type: application/json" -X POST -d @release.json https://api.github.com/repos/$(GH_OWNER)/$(GH_REPO)/releases

# show current releases
show_releases:
	curl -i "https://api.github.com/repos/$(GH_OWNER)/$(GH_REPO)/releases"
