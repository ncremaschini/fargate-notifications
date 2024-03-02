import * as cdk from "aws-cdk-lib";

import { ApplicatioProps, ConfigProps } from "./config";
import { NodejsFunction, SourceMapMode } from 'aws-cdk-lib/aws-lambda-nodejs';

import { FargateNotificationsStack } from "./fargate-notifications-stack";
import { SnsDlq } from "aws-cdk-lib/aws-lambda-event-sources";
import { resolve } from "path";

export function createStreamProcessor(
  stack: FargateNotificationsStack,
  appProps: ApplicatioProps,
  configProps: ConfigProps
) {
  
  const lambda = cdk.aws_lambda;

  const dynamoLambdaTrigger = new NodejsFunction(stack, 'dynamoLambdaTrigger', {
    entry: resolve(__dirname, "apps/stream_processor/stream-processor.ts"),
    functionName: 'dynamoLambdaTrigger',
    handler: 'handler',
    memorySize: +configProps.STREAM_PROCESSOR_LAMBDA_MEMORY,
    runtime: lambda.Runtime.NODEJS_20_X,
    timeout: cdk.Duration.seconds(2),
    bundling: {
      minify: true, 
      sourceMap: true, 
      sourceMapMode: SourceMapMode.INLINE, 
      sourcesContent: false,
      target: 'esnext'
    },
    logGroup: new cdk.aws_logs.LogGroup(
      stack,
      "fgntdynamoLambdaTriggerLogGroup",
      {
        logGroupName: "/fgnt/lambda/dynamoLambdaTrigger",
        retention: 1,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    ),
    environment: {
      SNS_TOPIC_ARN: appProps.statusTopic?.topicArn!,
    }
  });

  new lambda.EventSourceMapping(
    stack,
    "dynamoLambdaTriggerEventSourceMapping",
    {
      target: dynamoLambdaTrigger,
      eventSourceArn: appProps.statusTable?.tableStreamArn!,
      bisectBatchOnError: false,
      batchSize: 1,
      enabled: true,
      onFailure: new SnsDlq(appProps.statusStreamProcessorSnsDlq!),
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      retryAttempts: 3,
    } as any
  );

  appProps.statusStreamProcessor = dynamoLambdaTrigger;

  appProps.statusTable?.grantStreamRead(dynamoLambdaTrigger);
  appProps.statusTable?.grantReadWriteData(dynamoLambdaTrigger);
  appProps.statusTopic?.grantPublish(dynamoLambdaTrigger);
}
