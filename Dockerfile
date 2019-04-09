FROM node:9.2.0

RUN npm install -g truffle@4.1.15 ethereumjs-testrpc-sc@6.4.1

WORKDIR /app

COPY package.json ./package.json
COPY package-lock.json ./package-lock.json

RUN npm install

COPY contracts/ contracts/
COPY migrations/ migrations/
COPY scripts/ scripts/
COPY test/ test/
COPY truffle-config.js truffle.js .solcover.js ./


