FROM node:9.2.0

WORKDIR /app

RUN npm install -g truffle@4.1.13 ganache-cli@6.1.6
