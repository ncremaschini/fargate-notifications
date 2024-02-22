import * as cdk from "aws-cdk-lib";
import * as logs from "aws-cdk-lib/aws-logs";

import { ApplicatioProps, ConfigProps } from "./config";

import { FargateNotificationsStack } from "./fargate-notifications-stack";

export function createVpc(
  stack: FargateNotificationsStack,
  appProps: ApplicatioProps,
  configProps: ConfigProps
) {
  const cwLogs = new logs.LogGroup(stack, "fgnt-vpc-flowLogs", {
    logGroupName: "/aws/vpc/flowlogs",
    retention: logs.RetentionDays.ONE_DAY,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  const vpc = new cdk.aws_ec2.Vpc(stack, "FargateNotificationVpc", {
    vpcName: "FargateNotificationVpc",
    maxAzs: 2,
    ipAddresses: cdk.aws_ec2.IpAddresses.cidr("10.0.0.0/23"),
    flowLogs: {
      ["FlowLogs"]: {
        destination: cdk.aws_ec2.FlowLogDestination.toCloudWatchLogs(cwLogs),
        trafficType: cdk.aws_ec2.FlowLogTrafficType.ALL,
      },
    },
    subnetConfiguration: [
      {
        name: "fgtn-public",
        subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
        cidrMask: 25,
        mapPublicIpOnLaunch: true,
        reserved: false,
      },
      {
        name: "fgtn-private",
        subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
        cidrMask: 25,
        reserved: false,
      },
    ],
    natGateways: 1,
    createInternetGateway: true,
  });

  appProps.vpc = vpc;
}
