import { ISqsService, SqsServiceBase } from "./sqs-service-base";

export class SqsServiceEventBridge extends SqsServiceBase implements ISqsService{
  constructor() {
    super();
  }
  taskID: string;

  public async bootstrapSQS(taskId: string): Promise<string> {
    await super.bootstrapSQS(taskId);
  
    return this.statusQueueUrl;
  };

  public async tearDownSQS() {
    await super.tearDownSQS();
  };
}
