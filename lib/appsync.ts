import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cdk from "aws-cdk-lib";
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from "path";

import { ApplicatioProps, ConfigProps } from "./config";

import { FargateNotificationsStack } from "./fargate-notifications-stack";

export function createGraphQLApi(
  stack: FargateNotificationsStack,
  appProps: ApplicatioProps,
  configProps: ConfigProps
) {

  
  const api = new appsync.GraphqlApi(stack, "FgntStatusApi", {
    name: "FgntStatusApi",
    definition: appsync.Definition.fromFile(
      path.join(__dirname, "schema.graphql")
    ),
    authorizationConfig: {
      defaultAuthorization: {
        authorizationType: appsync.AuthorizationType.API_KEY,
        apiKeyConfig: {
          name: "FGNTStatusApiKey",
          description: "fgnt status api key",
          expires: cdk.Expiration.after(cdk.Duration.days(30)),
        },
      },
    },
    logConfig: {
      fieldLogLevel: appsync.FieldLogLevel.ALL,
      retention: logs.RetentionDays.ONE_DAY,
    },
    xrayEnabled: true,
  });

  api
    .addDynamoDbDataSource("FgntGetStatusTableDs", appProps.statusTable!)
    .createResolver("getStatus", {
      typeName: "Query",
      fieldName: "getStatus",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbGetItem(
        "id",
        "id"
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

  api
    .addDynamoDbDataSource("FgntListStatusTableDs", appProps.statusTable!)
    .createResolver("getStatusList", {
      typeName: "Query",
      fieldName: "listStatus",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList()
    });

  api
    .addDynamoDbDataSource("StatusTableMutationAddStatus", appProps.statusTable!)
    .createResolver("addStatus", {
      typeName: "Mutation",
      fieldName: "addStatus",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbPutItem(
        appsync.PrimaryKey.partition("id").auto(),
        appsync.Values.projecting("input")
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

  api
    .addDynamoDbDataSource(
      "StatusTableMutationUpdateStatus",
      appProps.statusTable!
    )
    .createResolver("updateStatus", {
      typeName: "Mutation",
      fieldName: "updateStatus",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbPutItem(
        appsync.PrimaryKey.partition("id").is("input.id"),
        appsync.Values.projecting("input")
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

  api
    .addDynamoDbDataSource(
      "StatusTableMutationDeleteStatus",
      appProps.statusTable!
    )
    .createResolver("deleteStatus", {
      typeName: "Mutation",
      fieldName: "deleteStatus",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbDeleteItem(
        "id",
        "id"
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

  new cdk.CfnOutput(stack, "GraphQLAPIURL", {
    value: api.graphqlUrl,
  });

  new cdk.CfnOutput(stack, "GraphQLAPIKey", {
    value: api.apiKey as string,
  });

  new cdk.CfnOutput(stack, "GraphQLAPIID", {
    value: api.apiId,
  });

  appProps.statusGraphQLApi = api;
}
