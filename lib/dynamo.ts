import * as cdk from "aws-cdk-lib";

import { ApplicatioProps, ConfigProps } from "./config";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";

import { FargateNotificationsStack } from "./fargate-notifications-stack";

export function createDynamoTable(
  stack: FargateNotificationsStack,
  appProps: ApplicatioProps,
  configProps: ConfigProps
) {
  
  const statusTable = new Table(stack, "FgntStatusTable", {
    tableName: "fgnt-status",
    pointInTimeRecovery: false,
    stream: cdk.aws_dynamodb.StreamViewType.NEW_IMAGE,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    billingMode: BillingMode.PAY_PER_REQUEST,
    partitionKey: { name: "id", type: AttributeType.STRING },
  });

  appProps.statusTable = statusTable;

}
