import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";

import { ApplicatioProps, ConfigProps } from "./config";

import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { FargateNotificationsStack } from "./fargate-notifications-stack";
import { aws_applicationautoscaling } from "aws-cdk-lib";
import { join } from "path";

export function createFargateCluster(
  stack: FargateNotificationsStack,
  appProps: ApplicatioProps,
  configProps: ConfigProps
) {
  const albSg = new ec2.SecurityGroup(stack, "fgtn-alb-sg", {
    vpc: appProps.vpc!,
    allowAllOutbound: true,
    securityGroupName: "fgt-alb-sg",
  });

  albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));

  albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

  const alb = new elbv2.ApplicationLoadBalancer(stack, "fgtn-alb", {
    loadBalancerName: "fgtn-alb",
    vpc: appProps.vpc!,
    internetFacing: true,
    securityGroup: albSg,
    vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
  });

  const httplistener = alb.addListener("HttpListener", {
    port: 80,
    open: true,
  });

  const clusterLogGroup = new logs.LogGroup(stack, "fgtn-ecs-exec-log-group", {
    retention: logs.RetentionDays.ONE_DAY,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    logGroupName: "/ecs/fgtn-ecs-exec-log-group",
  });

  const ecsCluster = new ecs.Cluster(stack, "fgtn-cluster", {
    vpc: appProps.vpc,
    clusterName: "fgtn-cluster",
    containerInsights: false,
    executeCommandConfiguration: {
      logConfiguration: {
        cloudWatchLogGroup: clusterLogGroup,
      },
      logging: ecs.ExecuteCommandLogging.OVERRIDE,
    },
  });

  const ecsRole = new iam.Role(stack, "fgtn-ecs-execution-role", {
    assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonECSTaskExecutionRolePolicy"
      ),
    ],
  });

  const sqsTargetGroup = createSqsService(
    stack,
    ecsRole,
    appProps,
    configProps,
    albSg,
    ecsCluster
  );

  httplistener.addAction("DefaultAction", {
    action: elbv2.ListenerAction.fixedResponse(200, {
      contentType: "text/plain",
      messageBody: "OK",
    }),
  });

  httplistener.addAction("HttpSqsAppAction", {
    action: elbv2.ListenerAction.forward([sqsTargetGroup]),
    conditions: [elbv2.ListenerCondition.pathPatterns(["/sqs*"])],
    priority: 1,
  });

  new cdk.CfnOutput(stack, "fgtnAlbDns", {
    value: alb.loadBalancerDnsName,
  });
}

function createSqsService(
  this: any,
  stack: FargateNotificationsStack,
  ecsRole: cdk.aws_iam.Role,
  appProps: ApplicatioProps,
  configProps: ConfigProps,
  albSg: cdk.aws_ec2.SecurityGroup,
  ecsCluster: cdk.aws_ecs.Cluster
) {
  const sqsClientTaskDefinition = new ecs.FargateTaskDefinition(
    stack,
    "fgtn-sqs-task-definition",
    {
      memoryLimitMiB: configProps.TASK_MEMORY,
      cpu: configProps.TASK_CPU,
      executionRole: ecsRole,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    }
  );

  sqsClientTaskDefinition.taskRole.addManagedPolicy(
    iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSQSFullAccess")
  );
  sqsClientTaskDefinition.taskRole.addManagedPolicy(
    iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSNSFullAccess")
  );
  sqsClientTaskDefinition.taskRole.addManagedPolicy(
    iam.ManagedPolicy.fromAwsManagedPolicyName("CloudwatchFullAccess")
  );

  const sqsClientLogGroup = new logs.LogGroup(
    stack,
    "fgtn-app-sqs-client-log-group",
    {
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      logGroupName: "/fgnt/ecs/app/sqs-client",
    }
  );

  appProps.queueProcessorLogGroup = sqsClientLogGroup;

  const sqsClientImage = new DockerImageAsset(stack, "sqs-client-image", {
    directory: join(__dirname, "apps", "sqs_client"),
  });

  const sqsClientContainer = sqsClientTaskDefinition.addContainer(
    "fgtn-sqs-client-container",
    {
      image: ecs.ContainerImage.fromDockerImageAsset(sqsClientImage),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: "sqs-client",
        logGroup: sqsClientLogGroup,
      }),
      environment: {
        STATUS_CHANGE_SNS_ARN: appProps.statusTopic?.topicArn!,
        SQS_INTERVAL_POLLING_MILLIS: configProps.SQS_INTERVAL_POLLING_MILLIS,
        SQS_VISIBILITY_TIMEOUT_SECOND:configProps.SQS_VISIBILITY_TIMEOUT_SECONDS,
        SQS_RECEIVE_MESSAGE_WAIT_SECONDS:configProps.SQS_RECEIVE_MESSAGE_WAIT_SECONDS,
        SQS_MAX_RECEIVE_COUNT: configProps.SQS_MAX_RECEIVE_COUNT,
      },
    }
  );

  sqsClientContainer.addPortMappings({
    containerPort: 80,
  });

  const sqsServiceSg = new ec2.SecurityGroup(stack, "fgtn-sqs-service-sg", {
    vpc: appProps.vpc!,
    allowAllOutbound: true,
    securityGroupName: "fgtn-ecs-sqs-client-sg",
  });

  sqsServiceSg.addIngressRule(albSg, ec2.Port.tcp(80));

  const sqsService = new ecs.FargateService(stack, "fgtn-sqs-service", {
    cluster: ecsCluster,
    taskDefinition: sqsClientTaskDefinition,
    desiredCount: configProps.DESIRED_TASKS,
    securityGroups: [sqsServiceSg],
    minHealthyPercent: 100,
    maxHealthyPercent: 200,
    assignPublicIp: false,
    healthCheckGracePeriod: cdk.Duration.seconds(5),
    enableExecuteCommand: true,
  });

  createServiceScaling(
    sqsService,
    configProps.MIN_TASKS,
    configProps.MAX_TASKS
  );

  const sqsTargetGroup = new elbv2.ApplicationTargetGroup(
    stack,
    "fgtn-sqs-targetGroup",
    {
      targets: [sqsService],
      protocol: elbv2.ApplicationProtocol.HTTP,
      vpc: appProps.vpc,
      port: 80,
      deregistrationDelay: cdk.Duration.seconds(10),
      healthCheck: {
        path: "/sqs",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        interval: cdk.Duration.seconds(5),
        timeout: cdk.Duration.seconds(2),
        healthyHttpCodes: "200",
      },
    }
  );
  return sqsTargetGroup;
}

function createServiceScaling(
  service: cdk.aws_ecs.FargateService,
  minCapacity: number,
  maxCapacity: number
) {
  const scaling = service.autoScaleTaskCount({
    minCapacity: minCapacity,
    maxCapacity: maxCapacity,
  });

  const mathExpressionOptions: cloudwatch.MathExpressionOptions = {
    period: cdk.Duration.minutes(1),
  };

  const scaleDownCpuUtilization = service.metricCpuUtilization(
    mathExpressionOptions
  );

  scaling.scaleOnMetric("AutoScaleDownCPU", {
    metric: scaleDownCpuUtilization,
    cooldown: cdk.Duration.seconds(120),
    scalingSteps: [
      { upper: 60, change: -2 },
      { upper: 40, change: -2 },
    ],
    evaluationPeriods: 5,
    datapointsToAlarm: 5,
    adjustmentType:
      aws_applicationautoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
  });

  const scaleUpCpuUtilization = service.metricCpuUtilization(
    mathExpressionOptions
  );

  scaling.scaleOnMetric("AutoScaleUpCPU", {
    metric: scaleUpCpuUtilization,
    cooldown: cdk.Duration.seconds(120),
    scalingSteps: [
      { lower: 60, change: +2 },
      { lower: 80, change: +2 },
    ],
    adjustmentType:
      aws_applicationautoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
  });
}
