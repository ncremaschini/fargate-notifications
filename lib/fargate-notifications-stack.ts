import * as appsync from './appsync';
import * as cdk from 'aws-cdk-lib';
import * as dynamo from './dynamo';
import * as event_bus from './event-bus';
import * as fargate from './fargate-cluster';
import * as metrics from './metrics';
import * as network from './network';
import * as stream_processor from './stream-processor';

import { ApplicatioProps, CHANNEL_TYPE_EVENT_BRIDGE, CHANNEL_TYPE_SNS, getConfig } from "./config";

import { Construct } from 'constructs';

export class FargateNotificationsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const configProps = getConfig();

    console.log("LOADED CONFIG: " +JSON.stringify(configProps));

    let appProps = {} as ApplicatioProps;
    
    network.createVpc(this, appProps, configProps);

    dynamo.createDynamoTable(this, appProps,configProps);

    if(configProps.CHANNEL_TYPE === CHANNEL_TYPE_SNS){
      event_bus.createStatusTopic(this, appProps,configProps);
      stream_processor.createStreamProcessor(this, appProps,configProps);
    }else if(configProps.CHANNEL_TYPE === CHANNEL_TYPE_EVENT_BRIDGE){
      event_bus.createStatusEventBridge(this, appProps,configProps);
    }

    appsync.createGraphQLApi(this, appProps,configProps);

    fargate.createFargateCluster(this, appProps,configProps);

    metrics.createSqsProcessorTimetakenMetric(this,appProps,configProps);    

  }
}
