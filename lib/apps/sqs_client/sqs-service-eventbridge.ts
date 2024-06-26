import {
  DeleteRuleCommand,
  DeleteRuleCommandInput,
  EventBridgeClient,
  PutRuleCommand,
  PutRuleCommandInput,
  PutTargetsCommand,
  PutTargetsCommandInput,
  RemoveTargetsCommand,
  RemoveTargetsCommandInput,
} from "@aws-sdk/client-eventbridge";
import { ISqsService, LastMessage, SqsServiceBase } from "./sqs-service-base";
import { Message, SetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import { SubscribeSqsToEventBridgeException, UnSubscribeSqsFromEventBridgeException } from "./exceptions";

export class SqsServiceEventBridge extends SqsServiceBase implements ISqsService{
  constructor() {
    super();
    this.eventBridgeClient = new EventBridgeClient({});
  }

  eventBridgeClient: EventBridgeClient;
  taskID: string;

  EVENT_BUS_NAME = process.env["STATUS_CHANGE_EVENT_BUS_NAME"];
  ruleName: string;

  public async bootstrapSQS(taskId: string): Promise<string> {
    
    await super.bootstrapSQS(taskId);

    this.ruleName = 'SendTOSQS-' + taskId;
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
    let status = messageBody.detail.status;
    
    let lastMessageSns: LastMessage = {
      ...lastMessage,
      message: status
    };

    return lastMessageSns;
  }

  private subscribeSqsToEventBridge = async (ruleName: string, eventBusName: string) =>{
     
    try {

      const sqsPolicy = {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Service": "events.amazonaws.com"
            },
            "Action": "sqs:SendMessage",
            "Resource": this.statusQeueArn
          },
        ]
      }
          
      const setQueueAttributesCmdOut = await this.sqsClient.send(new SetQueueAttributesCommand({
        QueueUrl: this.statusQueueUrl,
        Attributes: {
          Policy: JSON.stringify(sqsPolicy),
        },
      }));

      if(setQueueAttributesCmdOut.$metadata.httpStatusCode !== 200) {
        throw new SubscribeSqsToEventBridgeException("Failed to set queue permission for EventBridge");
      }

      const putRuleCommandInput: PutRuleCommandInput = {
        Name: ruleName,
        EventBusName: eventBusName,
        EventPattern: JSON.stringify({
          source: [{ "prefix": "" }],
        }),
        State: "ENABLED",
      };

      const putRuleCmdOut = await this.eventBridgeClient.send(new PutRuleCommand(putRuleCommandInput));
      if(putRuleCmdOut.$metadata.httpStatusCode !== 200) {
        throw new SubscribeSqsToEventBridgeException("Failed to put rule for EventBridge");
      }

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

      const putTargetCmdOut = await this.eventBridgeClient.send(new PutTargetsCommand(putTargetsCommandInput));
      if(putTargetCmdOut.$metadata.httpStatusCode !== 200) {
        throw new SubscribeSqsToEventBridgeException("Failed to put target for EventBridge");
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

      const removeTatgetCmdOut = await this.eventBridgeClient.send(new RemoveTargetsCommand(removeTargetsCommandInput));
      if(removeTatgetCmdOut.$metadata.httpStatusCode !== 200) {
        throw new UnSubscribeSqsFromEventBridgeException("Failed to remove target from EventBridge");
      }

      const deleteRuleCommandInput: DeleteRuleCommandInput = {
        Name: ruleName,
        EventBusName: eventBusName,
      };

      const deleteRuleCmdOut = await this.eventBridgeClient.send(new DeleteRuleCommand(deleteRuleCommandInput));

      if(deleteRuleCmdOut.$metadata.httpStatusCode !== 200) {
        throw new UnSubscribeSqsFromEventBridgeException("Failed to delete rule from EventBridge");
      }

    } catch (e: any) {
      throw new UnSubscribeSqsFromEventBridgeException(e.message);
    }
  }
}
