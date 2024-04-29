import {
  EventBridgeClient,
  PutTargetsCommand,
  PutTargetsCommandInput,
} from "@aws-sdk/client-eventbridge";
import { ISqsService, SqsServiceBase } from "./sqs-service-base";
import { SubscribeSqsToEventBridgeException, UnSubscribeSqsFromEventBridgeException } from "./exceptions";

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

  private subscribeSqsToEventBridge = async (ruleName: string, eventBusName: string) =>{
    
    try {
      const putTargetsCommandInput: PutTargetsCommandInput = {
        Rule: 'SendTOSQS-' + this.taskID,
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
    
  }
}
