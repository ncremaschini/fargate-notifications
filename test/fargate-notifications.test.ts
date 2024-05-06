import * as FargateNotifications from '../lib/fargate-notifications-stack';
import * as cdk from 'aws-cdk-lib';

import { Template } from 'aws-cdk-lib/assertions';

//test appsync api
test('AppSync API Created', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new FargateNotifications.FargateNotificationsStack(app
        , 'MyTestStack'
        , {});
    // THEN
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::AppSync::GraphQLApi', {
        AuthenticationType: 'API_KEY'
    });
}
);

//test dynamodb table
test('DynamoDB Table Created', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new FargateNotifications.FargateNotificationsStack(app
        , 'MyTestStack'
        , {});
    // THEN
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
        KeySchema: [
            {
                AttributeName: 'id',
                KeyType: 'HASH'
            }
        ]
    });
}
);

//test lambda function
if (process.env.CHANNEL_TYPE === 'sns') {
    test('Stream processor Lambda Function Created', () => {
        const app = new cdk.App();
        // WHEN
        const stack = new FargateNotifications.FargateNotificationsStack(app
            , 'MyTestStack'
            , {});
        // THEN
        const template = Template.fromStack(stack);
        template.hasResourceProperties('AWS::Lambda::Function', {
            Handler: 'index.handler'
        });
    });

    //test sns topic
    test('SNS Topic Created', () => {
        const app = new cdk.App();
        // WHEN
        const stack = new FargateNotifications.FargateNotificationsStack(app
            , 'MyTestStack'
            , {});
        // THEN
        const template = Template.fromStack(stack);
        template.hasResourceProperties('AWS::SNS::Topic', {
            TopicName: 'fgtn-status-change',
        });
    }
    );
}

if (process.env.CHANNEL_TYPE === 'ebrdg') {
    //test EventBridge bus created
    test('EventBridge Bus Created', () => {
        const app = new cdk.App();
        // WHEN
        const stack = new FargateNotifications.FargateNotificationsStack(app
            , 'MyTestStack'
            , {});
        // THEN
        const template = Template.fromStack(stack);
        template.hasResourceProperties('AWS::Events::EventBus', {
            Name: 'fgtn-status-change'
        });
    }
    );

    //test EventBridge pipe created
    test('EventBridge Pipe Created', () => {
        const app = new cdk.App();
        // WHEN
        const stack = new FargateNotifications.FargateNotificationsStack(app
            , 'MyTestStack'
            , {});
        // THEN
        const template = Template.fromStack(stack);
        template.hasResourceProperties('AWS::Pipes::Pipe', {
            Name: 'fgtn-status-change-pipe'
        });
    }
    );

    //verify event bridge pipe source is dynamo stream
    test('EventBridge Pipe Source Dynamo Stream', () => {
        const app = new cdk.App();
        // WHEN
        const stack = new FargateNotifications.FargateNotificationsStack(app
            , 'MyTestStack'
            , {});
        // THEN
        const template = Template.fromStack(stack);
        template.hasResourceProperties('AWS::Pipes::Pipe', {
            Name: 'fgtn-status-change-pipe',
            Source: {
                "Fn::GetAtt": [
                    "FgntStatusTableDD6E1544",
                    "StreamArn"
                ]
            }
        });
    }
    );
}

