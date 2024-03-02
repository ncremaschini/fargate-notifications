import express, { Request, Response } from "express";

import { Message } from "@aws-sdk/client-sqs";
import { Server } from "http";
import { SqsService } from "./sqs-service";

const gracefulShutdownTime = 6000;

let ONLINE = true;
let lastMessage = {};

const app = express();
const port = 80;

let server: Server;
let taskId: string;
let processedMessages: number;
let discardedMessages: number;
let openPollings: number;

const SQS_INTERVAL_POLLING_MILLIS = +process.env["SQS_INTERVAL_POLLING_MILLIS"]!;

let refreshInterval: string | number | NodeJS.Timeout | undefined;

app.get("/sqs", (req: Request, res: Response) => {
  ONLINE
    ? res
        .status(200)
        .send(
          `SQS Listener for queue ${taskId}.\nOpen pollings: ${openPollings}\nReceived messages: ${processedMessages}\nDiscarded messages: ${discardedMessages}.\nLast received message:\n ` +
            JSON.stringify(lastMessage,null,2)
        )
    : res.status(503).send("Server shutting down");
});

const sqsService = new SqsService();

getFargateTaskId()
  .then((fargateTaskId) => {
    taskId = fargateTaskId;
    processedMessages = 0;
    discardedMessages = 0;
    openPollings = 0;
    sqsService
      .bootrapSQS(taskId)
      .then((statusQueueUrl) => {
        server = app.listen(port, () =>
          console.log(
            `SQS Listener for queue ${taskId} listening on port ${port}!`
          )
        );

        refreshInterval = setInterval(async () => await receiveMessages(statusQueueUrl),SQS_INTERVAL_POLLING_MILLIS!);
      })
      .catch((err: any) => {
        console.error(err);
        process.exit(1);
      });
  })
  .catch((err: any) => {
    console.error(err);
    process.exit(1);
  });

const gracefulShutdownHandler = function gracefulShutdownHandler(signal: any) {
  console.log(`Caught ${signal}, gracefully shutting down`);
  ONLINE = false;

  setTimeout(() => {
    //clearInterval(refreshInterval);
    console.log(
      "🤞 Requesting AWS resources destroy. it can take up to 60 seconds to complete"
    );

    sqsService
      .tearDownSQS()
      .then(() => {
        console.log("All resources destroyed");
      })
      .catch((err: any) => {
        console.error("Error destorying AWS resources ", err?.message);
      })
      .finally(() => {
        server.close(function () {
          console.log("👋 shutting down");
          process.exit();
        });
      });
  }, gracefulShutdownTime);
};

process.on("SIGINT", gracefulShutdownHandler);
process.on("SIGTERM", gracefulShutdownHandler);

async function getFargateTaskId() {
  const metadataUri = process.env["ECS_CONTAINER_METADATA_URI_V4"] + "/task";

  let fargateTaskId: string | undefined;

  const res = await fetch(metadataUri);
  if (res.ok) {
    const data = await res.json();
    fargateTaskId = data.TaskARN!.split("/")[2];

    console.log(`Fargate Task Id: ${fargateTaskId}`);
  }

  if (fargateTaskId == undefined) {
    throw new Error("Fargate Task Id is undefined");
  }

  return fargateTaskId;
}

async function receiveMessages(statusQueueUrl: string) {
  try {
    openPollings++;
    const messages: Array<Message> = await sqsService.receiveMessage(
      statusQueueUrl
    );
    
    for (const message of messages) {
      openPollings--;
      let messageBody = JSON.parse(message.Body!);
      let statusBody = JSON.parse(messageBody.Message);
      
      let status = statusBody.status;
      
      //despite the name, this is the ISO Date the message was sent to the SNS topic
      let snsReceivedISODate = messageBody.Timestamp;
      
      let clientReceivedTimestamp;
      let clientReceivedDate;
      let sqsReceivedTimestamp;
      let sqsReceivedDate;
      let snsReceivedTimestamp;
      let snsTimeTakenInMillis;
      let sqsTimeTakenInMillis;
    
      if (snsReceivedISODate && message.Attributes) {
    
        clientReceivedTimestamp = +message.Attributes.ApproximateFirstReceiveTimestamp!;
        sqsReceivedTimestamp = +message.Attributes.SentTimestamp!;
        
        let snsReceivedDate = new Date(snsReceivedISODate);
        snsReceivedTimestamp = snsReceivedDate.getTime();
        
        clientReceivedDate = new Date(clientReceivedTimestamp!);
        sqsReceivedDate = new Date(sqsReceivedTimestamp!);
        
        snsTimeTakenInMillis = sqsReceivedTimestamp - snsReceivedTimestamp;
        sqsTimeTakenInMillis = clientReceivedTimestamp - sqsReceivedTimestamp;

      }else{
        console.warn("Message does not have SentTimestamp attribute");
      }

      lastMessage = {
        message: status,
        sentToSnsAt: snsReceivedISODate,
        receivedBySqsAt: sqsReceivedDate!.toISOString(),
        receivedByClientAt: clientReceivedDate!.toISOString(),
        snsTimeTakenInMillis: snsTimeTakenInMillis,
        sqsTimeTakenInMillis: sqsTimeTakenInMillis,
        snsToClientTimeTakenInMillis: snsTimeTakenInMillis! + sqsTimeTakenInMillis!,
        openPollings: openPollings,
      };

      await sqsService.deleteMessage(
        statusQueueUrl,
        message.ReceiptHandle as string
      );
      processedMessages++;
      //its required to print out the message to the console to be able to see it in the logs and let cloudwatch filter it
      console.log(JSON.stringify(lastMessage));
    }
  } catch (e: any) {
    console.error("Error handling messages ", e);
    discardedMessages++;
  }

  return;
}
