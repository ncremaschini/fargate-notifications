import {
  EventBridgeClient,
  PutTargetsCommand,
  PutTargetsCommandInput,
  RemoveTargetsCommand,
  RemoveTargetsCommandInput
} from "@aws-sdk/client-eventbridge";
import { ISqsService, LastMessage, SqsServiceBase } from "./sqs-service-base";
import { SubscribeSqsToEventBridgeException, UnSubscribeSqsFromEventBridgeException } from "./exceptions";

import { Message } from "@aws-sdk/client-sqs";

export class LastMessageEventBridge extends LastMessage {
  sentToEventBridgeAt: string;
  eventBridgeTimeTakenInMillis: number;
  eventBridgeToClientTimeTakenInMillis: number;
};

export class SqsServiceEventBridge extends SqsServiceBase implements ISqsService{
  constructor() {
    super();
    this.eventBridgeClient = new EventBridgeClient({});
  }

  eventBridgeClient: EventBridgeClient;
  taskID: string;

  EVENT_BUS_NAME = process.env["STATUS_CHANGE_EVENT_BUS_NAME"];
  ruleName = 'SendTOSQS-' + this.taskID;

  public async bootstrapSQS(taskId: string): Promise<string> {
    await super.bootstrapSQS(taskId);
    await this.subscribeSqsToEventBridge(this.ruleName, this.EVENT_BUS_NAME!);
    return this.statusQueueUrl;
  };

  public async tearDownSQS() {
    await super.tearDownSQS();
    await this.unsubscribeSqsFromEventBridge(this.ruleName, this.EVENT_BUS_NAME!);
  };

  public parseMessage(message: Message): LastMessage {

    let lastMessage: LastMessage = super.parseMessage(message);

    let messageBody = JSON.parse(message.Body!);
            
    //despite the name, this is the ISO Date the message was sent to the SNS topic
    let eventbridgeReceivedISODate = messageBody.Timestamp;
      
    let eventBridgeReceivedTimestamp;
    let eventBridgeTimeTakenInMillis;
      
    if (eventbridgeReceivedISODate && message.Attributes) {
          
      let snsReceivedDate = new Date(eventbridgeReceivedISODate);
      eventBridgeReceivedTimestamp = snsReceivedDate.getTime();
              
      eventBridgeTimeTakenInMillis = lastMessage.sqsReceivedTimestamp - eventBridgeReceivedTimestamp;
        
    }else{
      console.warn("Message does not have SentTimestamp attribute");
    }
    let lastMessageSns: LastMessageEventBridge = {
      ...lastMessage,
      sentToEventBridgeAt: eventbridgeReceivedISODate,
      eventBridgeTimeTakenInMillis: eventBridgeTimeTakenInMillis || 0,
      eventBridgeToClientTimeTakenInMillis: (eventBridgeTimeTakenInMillis || 0) + (lastMessage.sqsTimeTakenInMillis || 0),
    };

    return lastMessageSns;
  }

  private subscribeSqsToEventBridge = async (ruleName: string, eventBusName: string) =>{
    
    try {
      const putTargetsCommandInput: PutTargetsCommandInput = {
        Rule: ruleName,
        EventBusName: eventBusName,
        Targets: [
          {
            Arn: this.statusQeueArn,
            Id: this.taskID,
          },
        ],
      };

      const cmdOut = await this.eventBridgeClient.send(new PutTargetsCommand(putTargetsCommandInput));
      if(cmdOut.$metadata.httpStatusCode !== 200) {
        throw new SubscribeSqsToEventBridgeException("Failed to subscribe to EventBridge");
      }
    } catch (e: any) {
      throw new SubscribeSqsToEventBridgeException(e.message);
      
    }
  }

  private unsubscribeSqsFromEventBridge = async (ruleName: string, eventBusName: string) => {
    try {
      const removeTargetsCommandInput: RemoveTargetsCommandInput = {
        Rule: ruleName,
        EventBusName: eventBusName,
        Ids: [this.taskID],
      };

      const cmdOut = await this.eventBridgeClient.send(new RemoveTargetsCommand(removeTargetsCommandInput));
      if(cmdOut.$metadata.httpStatusCode !== 200) {
        throw new UnSubscribeSqsFromEventBridgeException("Failed to unsubscribe from EventBridge");
      }

    } catch (e: any) {
      throw new UnSubscribeSqsFromEventBridgeException(e.message);
    }
  }
}
