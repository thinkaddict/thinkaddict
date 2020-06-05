FROM node:14-slim

WORKDIR /src

RUN npm install --global gulp-cli@2.3

COPY src/package*.json ./
RUN npm install

CMD bash