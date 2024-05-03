import * as cdk from 'aws-cdk-lib';
import * as dotenv from "dotenv";
import * as logs from "aws-cdk-lib/aws-logs";

dotenv.config();

export const CHANNEL_TYPE_SNS = "sns";
export const CHANNEL_TYPE_EVENT_BRIDGE = "ebrdg";

export type ConfigProps = {
    MIN_TASKS: number;
    MAX_TASKS: number;
    DESIRED_TASKS: number;
    TASK_CPU: number;
    TASK_MEMORY: number;
    STATS_PRINT_MILLIS: string;
    SQS_VISIBILITY_TIMEOUT_SECONDS: string;
    SQS_RECEIVE_MESSAGE_WAIT_SECONDS: string;
    SQS_MAX_RECEIVE_COUNT: string;
    STREAM_PROCESSOR_LAMBDA_MEMORY: string;
    CHANNEL_TYPE: string;
};

export const getConfig = (): ConfigProps => ({
    MIN_TASKS: process.env.MIN_TASKS ? +process.env.MIN_TASKS : 1,
    MAX_TASKS: process.env.MAX_TASKS ? +process.env.MAX_TASKS : 1,
    DESIRED_TASKS: process.env.DESIRED_TASKS ? +process.env.DESIRED_TASKS : 1,
    TASK_CPU: process.env.TASK_CPU ? +process.env.TASK_CPU : 256,
    TASK_MEMORY: process.env.TASK_MEMORY ? +process.env.TASK_MEMORY : 512,
    STATS_PRINT_MILLIS: process.env.STATS_PRINT_MILLIS || "1000",
    SQS_VISIBILITY_TIMEOUT_SECONDS: process.env.SQS_VISIBILITY_TIMEOUT_SECONDS || "30",
    SQS_RECEIVE_MESSAGE_WAIT_SECONDS: process.env.SQS_RECEIVE_MESSAGE_WAIT_SECONDS || "20",
    SQS_MAX_RECEIVE_COUNT: process.env.SQS_MAX_RECEIVE_COUNT || "10",
    STREAM_PROCESSOR_LAMBDA_MEMORY: process.env.STREAM_PROCESSOR_LAMBDA_MEMORY || "128",
    CHANNEL_TYPE: process.env.CHANNEL_TYPE || CHANNEL_TYPE_SNS,
});

export type ApplicatioProps = {
    vpc?: cdk.aws_ec2.IVpc;
    statusTopic?: cdk.aws_sns.ITopic;
    statusTable?: cdk.aws_dynamodb.ITable;
    statusStreamProcessor?: cdk.aws_lambda.IFunction;
    statusStreamProcessorSnsDlq? :  cdk.aws_sns.ITopic;
    statusEventBus?: cdk.aws_events.IEventBus;
    statusGraphQLApi? :cdk.aws_appsync.GraphqlApi;
    eventProcessorLogGroup? : logs.ILogGroup;
 }