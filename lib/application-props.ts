import * as cdk from 'aws-cdk-lib';
import * as logs from "aws-cdk-lib/aws-logs";

export type ApplicatioProps = {
   vpc?: cdk.aws_ec2.IVpc;
   statusTopic?: cdk.aws_sns.ITopic;
   statusTable?: cdk.aws_dynamodb.ITable;
   statusStreamProcessor?: cdk.aws_lambda.IFunction;
   statusStreamProcessorSnsDlq? :  cdk.aws_sns.ITopic;
   statusGraphQLApi? :cdk.aws_appsync.GraphqlApi;
   queueProcessorLogGroup? : logs.ILogGroup;
}