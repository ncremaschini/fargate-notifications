import * as sns from "aws-cdk-lib/aws-sns";

import { ApplicatioProps, ConfigProps } from "./config";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";

import { CfnPipe } from "aws-cdk-lib/aws-pipes";
import { EventBus } from "aws-cdk-lib/aws-events";
import { FargateNotificationsStack } from "./fargate-notifications-stack";

export function createStatusTopic(
  stack: FargateNotificationsStack,
  appProps: ApplicatioProps,
  configProps: ConfigProps
) {

  const statusTopic = new sns.Topic(stack, "fgtn-status-sns", {
    topicName: "fgtn-status-change",
    displayName: "FGTN status change",
    fifo: false,
  });

  appProps.statusTopic = statusTopic;

  //create topic dlq
  const statusTopicDlq = new sns.Topic(stack, "fgtn-status-dlq", {
    topicName: "fgtn-status-change-dlq",
    displayName: "FGTN status change",
    fifo: false,
  })
  appProps.statusStreamProcessorSnsDlq = statusTopicDlq;

}

export function createStatusEventBridge(
  stack: FargateNotificationsStack,
  appProps: ApplicatioProps,
  configProps: ConfigProps
) {
  //create event bridge
  const eventBus = new EventBus(stack, "fgtn-status-ebrdg", {
    eventBusName: "fgtn-status-change",
  });

  appProps.statusEventBus = eventBus;

  const targetPolicy = new PolicyDocument({
    statements: [
      new PolicyStatement({
        resources: [eventBus.eventBusArn],
        actions: ["events:PutEvents"],
        effect: Effect.ALLOW,
      }),
    ],
  });

  const sourcePolicy = new PolicyDocument({
    statements: [
      new PolicyStatement({
        resources: [appProps.statusTable?.tableStreamArn!],
        actions: [
          "dynamodb:DescribeStream",
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:ListStreams",
        ],
        effect: Effect.ALLOW,
      }),
    ],
  });

  const pipeRole = new Role(stack, "fgtn-status-ebrdg-role", {
    assumedBy: new ServicePrincipal("pipes.amazonaws.com"),
    inlinePolicies: {
      sourcePolicy,
      targetPolicy,
    },
  });

  new CfnPipe(stack, "fgtn-status-ebrdg-pipe", {
    name: "fgtn-status-change-pipe",
    roleArn: pipeRole.roleArn,
    source: appProps.statusTable?.tableStreamArn!,

    sourceParameters: {
      dynamoDbStreamParameters: {
        startingPosition: "LATEST",
      },
    },
    target: eventBus.eventBusArn,
    targetParameters: {
      inputTemplate: `{
        "id": <$.dynamodb.NewImage.id.S>,
        "status": <$.dynamodb.NewImage.status.S>
      }`,
    },
  });
}
