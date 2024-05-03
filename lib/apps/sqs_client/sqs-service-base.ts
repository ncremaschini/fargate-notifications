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
} from "./exceptions";

export interface ISqsService {
  bootstrapSQS(taskId: string): Promise<string>;
  tearDownSQS(): Promise<void>;
  receiveMessages(queueUrl: string): Promise<Message[]>;
  deleteMessage(queueUrl: string, receiptHandle: string): Promise<void>;
  deleteMessages(queueUrl: string,messages:Message[]): Promise<void>;
  parseMessage(message: Message): LastMessage;
}

export class LastMessage {
  message: string | undefined;
  receivedByClientAt: string;
  receivedBySqsAt: string;
  sqsReceivedTimestamp: any;
  sqsTimeTakenInMillis: number;
};

export class SqsServiceBase implements ISqsService {
  protected sqsClient: SQSClient;
  protected cloudwatchClient: CloudWatchClient;
  protected statusQueueUrl: string;
  protected statusQeueArn: string;
  protected statusDlqUrl: string;
  protected statusDlqName: string;
  protected statusDlqArn: string;
  protected taskID: string;
  
  protected SQS_VISIBILITY_TIMEOUT_SECONDS = process.env["SQS_VISIBILITY_TIMEOUT_SECONDS"];
  protected SQS_RECEIVE_MESSAGE_WAIT_SECONDS = process.env["SQS_RECEIVE_MESSAGE_WAIT_SECONDS"];
  protected SQS_MAX_RECEIVE_COUNT = process.env["SQS_MAX_RECEIVE_COUNT"];

  constructor() {
    let sqsConfig = {};
    this.sqsClient = new SQSClient(sqsConfig);
      
    let cwConfig = {};
    this.cloudwatchClient = new CloudWatchClient(cwConfig);
  }
  
  public async bootstrapSQS (taskId: string): Promise<string>{
    this.taskID = taskId;
    this.statusDlqName = taskId + "-dlq";
    this.statusDlqUrl = await this.createSqs(this.statusDlqName);
    this.statusDlqArn = await this.getSQSAttributes(this.statusDlqUrl);

    console.log("status DLQ URL: ", this.statusDlqUrl);

    this.statusQueueUrl = await this.createSqs(taskId, this.statusDlqArn);
    this.statusQeueArn = await this.getSQSAttributes(this.statusQueueUrl);
    console.log("status SQS URL: ", this.statusQueueUrl);

    await this.setDLQPolicy(
      this.statusQeueArn,
      this.statusDlqUrl,
      this.statusDlqArn
    );

    await this.createAlarmOnQueue(this.statusDlqName);

    return this.statusQueueUrl;
  };

  public async tearDownSQS(){
    await this.deleteQueue(this.statusQueueUrl);
    await this.deleteQueue(this.statusDlqUrl);
    await this.deleteAlarmOnQueue(this.statusDlqName);
  };

  public async receiveMessages(queueUrl: string){
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

  public async deleteMessage(queueUrl: string, receiptHandle: string){
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

  public async deleteMessages(queueUrl: string,messages:Message[]){
    if (messages.length > 0) {
      for (const message of messages) {
        if (message.ReceiptHandle) {
          this.deleteMessage(queueUrl, message.ReceiptHandle as string);
        }
      }
    }
  }

  public parseMessage(message: Message): LastMessage {
    let messageBody = JSON.parse(message.Body!);
        
    let clientReceivedTimestamp;
    let clientReceivedDate;
    let sqsReceivedTimestamp;
    let sqsReceivedDate;
    let sqsTimeTakenInMillis;
      
    if (message.Attributes) {
        
      clientReceivedTimestamp = +message.Attributes.ApproximateFirstReceiveTimestamp!;
      sqsReceivedTimestamp = +message.Attributes.SentTimestamp!;
          
      clientReceivedDate = new Date(clientReceivedTimestamp!);
      sqsReceivedDate = new Date(sqsReceivedTimestamp!);
      
      sqsTimeTakenInMillis = clientReceivedTimestamp - sqsReceivedTimestamp;
        
    }else{
      console.warn("Message does not have SentTimestamp attribute");
    }
    let lastMessage: LastMessage = {
      message: undefined,
      receivedBySqsAt: sqsReceivedDate!.toISOString(),
      receivedByClientAt: clientReceivedDate!.toISOString(),
      sqsTimeTakenInMillis: sqsTimeTakenInMillis || 0,
      sqsReceivedTimestamp: sqsReceivedTimestamp,
    };

    return lastMessage;
  }

  private async deleteQueue(queueUrl: string){
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

  private createSqs = async (
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
          app: "fargate-notification",
          taskId: this.taskID
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

  private getSQSAttributes = async (queueUrl: string) => {
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


  private setDLQPolicy = async (queueArn: string, dlqUrl: string, dlqArn: string) => {
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

  private createAlarmOnQueue = async (queueName: string) => {
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
        },
        {
          Key: "taskId",
          Value: this.taskID
        }
      ]
    });

    try {
      await this.cloudwatchClient.send(command);
    } catch (err: any) {
      throw new PutMetricAlarmException(err.message);
    }
  };

  private deleteAlarmOnQueue = async (queueName: string) => {
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

