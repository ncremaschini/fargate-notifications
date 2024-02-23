# Welcome to Fargate Notifications CDK project!

This project is a simple CDK project that deploys a Fargate service with containers that receive notification of dybamic changes leveraging fan-out pattern based on SNS and SQS.

## The project
The scope of the project is to measure time taken by each components in the chain to process events down to the Fargate service. The project is composed by the following components:
- AppSync API: it's the entry point for the events. It's a GraphQL API that accepts mutations to send events to the Fargate service.
- DynamoDB: it's used to store the events
- Dynamo stream: it's used to trigger the Lambda function that sends the events to the SNS topic
- Lambda function: it's used to send the events to the SNS topic
- SQS: it's used to buffer the events before sending them to the Fargate service single containers

![Architecture](./docs/hld.png)

1. The AppSync API receives the events and stores them in the DynamoDB table
2. The DynamoDB stream events 
3. The Lambda function is triggered by the DynamoDB stream
4. The Lambda function sends the events to the SNS topic
5. The SNS topic sends the events to the SQS queues
6. The Fargate service reads the events from the SQS queues
7. If events are not processed within a certain time, they are sent to the DLQ
8. A cloudwatch alarm is triggered if the DLQ has events

Custome metrics are also created to measure the time taken by each component to process the events, so you can use cloudwatch to create dashboards and alarms based on these metrics.

Here an example board
![Cloudwatch dashboard](./docs/cloudwatch-dashboard.png)

## How to deploy
Use the .env file to set the environment variables. The following variables are required:
- MIN_TASKS: the minimum number of tasks to run in the Fargate service
- MAX_TASKS: the maximum number of tasks to run in the Fargate service
- DESIRED_TASKS: the desired number of tasks to run in the Fargate service
- TASK_CPU: the CPU units to allocate to the tasks
- TASK_MEMORY: the memory to allocate to the tasks
- SQS_INTERVAL_POLLING_MILLIS: the interval in milliseconds to poll the SQS queues
- SQS_VISIBILITY_TIMEOUT: the visibility timeout in seconds for the SQS queues
- SQS_RECEIVE_MESSAGE_WAIT_SECONDS: the time in seconds to wait for messages to be available in the SQS queues before polling again
- SQS_MAX_RECEIVE_COUNT: the maximum number of times a message can be received before being sent to the DLQ

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
