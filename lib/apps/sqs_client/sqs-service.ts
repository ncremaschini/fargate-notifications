import {
  CloudWatchClient,
  DeleteAlarmsCommand,
  PutMetricAlarmCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  CreateQueueCommand,
  CreateQueueCommandInput,
  CreateQueueCommandOutput,
  DeleteMessageCommand,
  DeleteMessageCommandInput,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueAttributesCommandOutput,
  Message,
  ReceiveMessageCommand,
  ReceiveMessageCommandInput,
  ReceiveMessageCommandOutput,
  SQSClient,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  DeleteAlarmsException,
  DeleteQueueMessageException,
  GetSQSAttributeException,
  PutMetricAlarmException,
  ReceiveSQSMessageException,
  SQSCreateException,
  SQSDeleteException,
  SetDLQPolicyException,
  SetSQSPolicyException,
  SubscribeToSNSException,
  UnSubscribeFromSNSException
} from "./exceptions";
import {
  SNSClient,
  SubscribeCommand,
  SubscribeCommandInput,
  UnsubscribeCommand,
  UnsubscribeCommandInput,
} from "@aws-sdk/client-sns";

export class SqsService {
  constructor() {
    let sqsConfig = {};
    this.sqsClient = new SQSClient(sqsConfig);
    
    let snsConfig = {};
    this.snsClient = new SNSClient(snsConfig);
    
    let cwConfig = {};
    this.cloudwatchClient = new CloudWatchClient(cwConfig);
  }
  
  sqsClient: SQSClient;
  snsClient: SNSClient;
  cloudwatchClient: CloudWatchClient;
  statusQueueUrl: string;
  statusQeueArn: string;
  snsSubscriptionArn: string | undefined;
  statusDlqUrl: string;
  statusDlqName: string;
  statusDlqArn: string;
  
  SNS_ARN = process.env["STATUS_CHANGE_SNS_ARN"];
  SQS_VISIBILITY_TIMEOUT_SECONDS = process.env["SQS_VISIBILITY_TIMEOUT_SECONDS"];
  SQS_RECEIVE_MESSAGE_WAIT_SECONDS = process.env["SQS_RECEIVE_MESSAGE_WAIT_SECONDS"];
  SQS_MAX_RECEIVE_COUNT = process.env["SQS_MAX_RECEIVE_COUNT"];
  
  bootrapSQS = async (queueName: string) => {
    
    this.statusDlqName = queueName + "-dlq";
    this.statusDlqUrl = await this.createSqs(this.statusDlqName);
    this.statusDlqArn = await this.getSQSAttributes(this.statusDlqUrl);

    console.log("status DLQ URL: ", this.statusDlqUrl);

    this.statusQueueUrl = await this.createSqs(queueName, this.statusDlqArn);
    this.statusQeueArn = await this.getSQSAttributes(this.statusQueueUrl);
    console.log("status SQS URL: ", this.statusQueueUrl);

    await this.setSNSPolicy(
      this.statusQeueArn,
      this.statusQueueUrl,
      this.SNS_ARN!
    );
    await this.setDLQPolicy(
      this.statusQeueArn,
      this.statusDlqUrl,
      this.statusDlqArn
    );

    this.snsSubscriptionArn = await this.subscribeSqsToSns(this.statusQeueArn, this.SNS_ARN!);

    await this.createAlarmOnQueue(this.statusDlqName);

    return this.statusQueueUrl;
  };

  tearDownSQS = async () => {
    await this.deleteQueue(this.statusQueueUrl);
    await this.deleteQueue(this.statusDlqUrl);
    await this.deleteAlarmOnQueue(this.statusDlqName);
    await this.deleteSqsSnsSubscription(this.snsSubscriptionArn!);
  };

  deleteQueue = async (queueUrl: string) => {
    try {
      const deleteQueueCommand = new DeleteQueueCommand({
        QueueUrl: queueUrl,
      });

      const response = await this.sqsClient.send(deleteQueueCommand);

      if (response.$metadata.httpStatusCode == 200) {
        console.log(`Queue ${queueUrl} deleted`);
      } else {
        console.warn(response.$metadata);
      }
    } catch (e: any) {
      throw new SQSDeleteException("Error deleting queue: " + e.message);
    }
  };

  createSqs = async (
    queueName: string,
    dlqArn: string | undefined = undefined
  ) => {
    let result: string = "";
    try {
      let sqsInput: CreateQueueCommandInput = {
        QueueName: queueName,
        Attributes: {
          ReceiveMessageWaitTimeSeconds: this.SQS_RECEIVE_MESSAGE_WAIT_SECONDS,
          VisibilityTimeout: this.SQS_VISIBILITY_TIMEOUT_SECONDS,
          ...(dlqArn !== undefined && {
            RedrivePolicy: JSON.stringify({
              deadLetterTargetArn: dlqArn,
              maxReceiveCount: this.SQS_MAX_RECEIVE_COUNT,
            }),
          }),
        },
        tags: {
          app: "fargate-notification"
        }
      };

      const sqsCommand = new CreateQueueCommand(sqsInput);
      const sqsReponse: CreateQueueCommandOutput = await this.sqsClient.send(
        sqsCommand
      );
      result = sqsReponse.QueueUrl as string;
    } catch (e: any) {
      throw new SQSCreateException(e.message);
    }
    return result;
  };

  getSQSAttributes = async (queueUrl: string) => {
    let queueArn: string = "";
    try {
      const getAttributesCommand = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["QueueArn"],
      });

      const attributeCommandResponse: GetQueueAttributesCommandOutput =
        await this.sqsClient.send(getAttributesCommand);

      if (attributeCommandResponse.Attributes !== undefined) {
        queueArn = attributeCommandResponse.Attributes.QueueArn!;
      } else {
        throw new GetSQSAttributeException("Unable to get SQS Attributes");
      }
    } catch (e: any) {
      throw new GetSQSAttributeException(e?.message);
    }
    return queueArn;
  };

  setSNSPolicy = async (
    queueArn: string,
    queueUrl: string,
    sns_arn: string
  ) => {
    try {
      let policy = JSON.stringify({
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "sns.amazonaws.com",
            },
            Action: "sqs:SendMessage",
            Resource: queueArn,
            Condition: {
              ArnEquals: {
                "aws:SourceArn": sns_arn,
              },
            },
          },
        ],
      });
      const setCommandInput = {
        QueueUrl: queueUrl,
        Attributes: {
          Policy: policy,
        },

      };

      const setCommand = new SetQueueAttributesCommand(setCommandInput);

      await this.sqsClient.send(setCommand);
    } catch (e: any) {
      throw new SetSQSPolicyException(e.message);
    }
  };

  setDLQPolicy = async (queueArn: string, dlqUrl: string, dlqArn: string) => {
    try {
      let policy = JSON.stringify({
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "sqs.amazonaws.com",
            },
            Action: "sqs:SendMessage",
            Resource: dlqArn,
            Condition: {
              ArnEquals: {
                "aws:SourceArn": queueArn,
              },
            },
          },
        ],
      });
      const setCommandInput = {
        QueueUrl: dlqUrl,
        Attributes: {
          Policy: policy,
        },
      };

      const setCommand = new SetQueueAttributesCommand(setCommandInput);

      await this.sqsClient.send(setCommand);
    } catch (e: any) {
      throw new SetDLQPolicyException("Error setting DLQ policy: " + e.message);
    }
  };

  subscribeSqsToSns = async (queueArn: string, snsArn: string) => {
    try {
      const snsSubscribeCommandInput: SubscribeCommandInput = {
        Endpoint: queueArn,
        Protocol: "sqs",
        TopicArn: snsArn,
      };
      const snsSubscribeCommand = new SubscribeCommand(
        snsSubscribeCommandInput
      );
      const cmdOut =  await this.snsClient.send(snsSubscribeCommand);
      return cmdOut.SubscriptionArn;
    } catch (e: any) {
      throw new SubscribeToSNSException(e.message);
    }
  };

  deleteSqsSnsSubscription = async (subscriptionArn: string) => {
    try {
      const snsUnsubscribeCommandInput: UnsubscribeCommandInput = {
        SubscriptionArn: subscriptionArn,
      };
      const snsUnsubscribeCommand = new UnsubscribeCommand(
        snsUnsubscribeCommandInput
      );
      await this.snsClient.send(snsUnsubscribeCommand);
      console.log(`Subscription ${subscriptionArn} deleted`);
    } catch (e: any) {
      throw new UnSubscribeFromSNSException(e.message);
    }
  }

  receiveMessage = async (queueUrl: string) => {
    let messages: Array<Message> = [];
    try {
      let receiveMessageCommandInput: ReceiveMessageCommandInput = {
        AttributeNames: ["All"],
        QueueUrl: queueUrl,
        WaitTimeSeconds: +this.SQS_RECEIVE_MESSAGE_WAIT_SECONDS!,
      };

      let receiveMessageCommand = new ReceiveMessageCommand(
        receiveMessageCommandInput
      );

      const receiveMessageCommandOutput: ReceiveMessageCommandOutput =
        await this.sqsClient.send(receiveMessageCommand);
      if (
        receiveMessageCommandOutput.Messages !== undefined &&
        receiveMessageCommandOutput.Messages.length > 0
      ) {
        messages = receiveMessageCommandOutput.Messages;
      }
    } catch (e: any) {
      throw new ReceiveSQSMessageException(e?.message);
    }
    return messages;
  };

  deleteMessages = async (queueUrl: string,messages:Message[]) => {
    if (messages.length > 0) {
      for (const message of messages) {
        if (message.ReceiptHandle) {
          this.deleteMessage(queueUrl, message.ReceiptHandle as string);
        }
      }
    }
  }

  deleteMessage = async (queueUrl: string, receiptHandle: string) => {
    try {
      const deleteMessageCommandInput: DeleteMessageCommandInput = {
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      };

      const deleteMessageCommand = new DeleteMessageCommand(
        deleteMessageCommandInput
      );

      await this.sqsClient.send(deleteMessageCommand);
    } catch (e: any) {
      throw new DeleteQueueMessageException(e.message);
    }
  };

  createAlarmOnQueue = async (queueName: string) => {
    const alarmName = `TooManyMessagesOn-${queueName}`;

    const command = new PutMetricAlarmCommand({
      AlarmName: alarmName,
      AlarmDescription: "Alarm when dlq is not empty",
      ComparisonOperator: "GreaterThanThreshold",
      EvaluationPeriods: 1,
      Threshold: 0,
      DatapointsToAlarm: 1,
      TreatMissingData: "ignore",
      ActionsEnabled: false,
      Metrics: [
        {
          Id: "m1",
          ReturnData: false,
          MetricStat: {
            Metric: {
              Namespace: "AWS/SQS",
              MetricName: "ApproximateNumberOfMessagesVisible",
              Dimensions: [
                {
                  Name: "QueueName",
                  Value: queueName,
                },
              ],
            },
            Period: 10,
            Stat: "Sum",
            Unit: "Count",
          }
        },
        {
          Id: "m2",
          MetricStat: {
            Metric: {
              Namespace: "AWS/SQS",
              MetricName: "ApproximateNumberOfMessagesNotVisible",
              Dimensions: [
                {
                  Name: "QueueName",
                  Value: queueName,
                },
              ],
            },
            Period: 10,
            Stat: "Sum",
            Unit: "Count",
          },
          ReturnData: false
        },
        {
          Id: "e1",
          Expression: "RATE(m1+m2)",
          Label: "Message rate",
          Period: 10,
          ReturnData: true,
        },
      ],
      Tags: [
        {
          Key: "app",
          Value: "fargate-notification"
        }
      ]
    });

    try {
      await this.cloudwatchClient.send(command);
    } catch (err: any) {
      throw new PutMetricAlarmException(err.message);
    }
  };

  deleteAlarmOnQueue = async (queueName: string) => {
    const command = new DeleteAlarmsCommand({
      AlarmNames: [`TooManyMessagesOn-${queueName}`],
    });

    try {
      await this.cloudwatchClient.send(command);
      console.log(`Alarm TooManyMessagesOn-${queueName} deleted`);
    } catch (err: any) {
      throw new DeleteAlarmsException(err.message);
    }
  };
}
