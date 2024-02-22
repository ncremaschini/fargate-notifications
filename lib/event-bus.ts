import * as sns from "aws-cdk-lib/aws-sns";

import { ApplicatioProps, ConfigProps } from "./config";

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
