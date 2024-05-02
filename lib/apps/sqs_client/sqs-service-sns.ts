import { ISqsService, LastMessage, SqsServiceBase } from "./sqs-service-base";
import { Message, SetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import {
  SNSClient,
  SubscribeCommand,
  SubscribeCommandInput,
  UnsubscribeCommand,
  UnsubscribeCommandInput,
} from "@aws-sdk/client-sns";
import {
  SetSQSPolicyException,
  SubscribeToSNSException,
  UnSubscribeFromSNSException
} from "./exceptions";

export class LastMessageSns extends LastMessage {
  sentToSnsAt: string;
  snsTimeTakenInMillis: number;
  snsToClientTimeTakenInMillis: number;
};

export class SqsServiceSns extends SqsServiceBase implements ISqsService{
  constructor() {
    super();
 
    let snsConfig = {};
    this.snsClient = new SNSClient(snsConfig);
  }
  
  snsClient: SNSClient;  
  snsSubscriptionArn: string | undefined;
  taskID: string;
  
  SNS_ARN = process.env["STATUS_CHANGE_SNS_ARN"];

  public async bootstrapSQS(taskId: string): Promise<string> {
    await super.bootstrapSQS(taskId);
    await this.setSNSPolicy(this.statusQeueArn, this.statusQueueUrl, this.SNS_ARN!);
    this.snsSubscriptionArn = await this.subscribeSqsToSns(this.statusQeueArn, this.SNS_ARN!);

    return this.statusQueueUrl;
  };

  public async tearDownSQS() {
    await super.tearDownSQS();
    await this.deleteSqsSnsSubscription(this.snsSubscriptionArn!);
  };

  public parseMessage(message: Message): LastMessage {

    let lastMessage: LastMessage = super.parseMessage(message);

    let messageBody = JSON.parse(message.Body!);
            
    //despite the name, this is the ISO Date the message was sent to the SNS topic
    let snsReceivedISODate = messageBody.Timestamp;
      
    let snsReceivedTimestamp;
    let snsTimeTakenInMillis;
      
    if (snsReceivedISODate && message.Attributes) {
          
      let snsReceivedDate = new Date(snsReceivedISODate);
      snsReceivedTimestamp = snsReceivedDate.getTime();
              
      snsTimeTakenInMillis = lastMessage.sqsReceivedTimestamp - snsReceivedTimestamp;
        
    }else{
      console.warn("Message does not have SentTimestamp attribute");
    }
    let lastMessageSns: LastMessageSns = {
      ...lastMessage,
      sentToSnsAt: snsReceivedISODate,
      snsTimeTakenInMillis: snsTimeTakenInMillis || 0,
      snsToClientTimeTakenInMillis: (snsTimeTakenInMillis || 0) + (lastMessage.sqsTimeTakenInMillis || 0),
    };

    return lastMessageSns;
  }

  private setSNSPolicy = async (
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

  private subscribeSqsToSns = async (queueArn: string, snsArn: string) => {
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

  private deleteSqsSnsSubscription = async (subscriptionArn: string) => {
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
}
