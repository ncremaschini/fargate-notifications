FROM node:20-slim AS build

WORKDIR /srv

ADD package.json /tmp/package.json
RUN cd /tmp && npm install
RUN cp -a /tmp/node_modules ./

COPY tsconfig.json package.json *.ts ./

RUN npm run build

FROM node:20-slim 

WORKDIR /app
COPY --from=build /srv .

EXPOSE 80

CMD [ "node", "sqs-client.js" ]
