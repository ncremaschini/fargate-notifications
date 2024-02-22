import { SNS } from "@aws-sdk/client-sns";

const snsPublisher = new SNS();

//lambda function that consumes a dynamo stream and publish event to SNS topic
export const handler = async (event: any) => {
  
  const { Records } = event;

  const promises = Records.map((record: any) => {
    const { eventName, dynamodb } = record;
    const { NewImage } = dynamodb;

    const { id,status } = NewImage;
    
    const message = {
      id: id.S,
      status: status.S,
      event: eventName,
    };

    let strMessage = JSON.stringify(message);

    console.log("publishing message: " + strMessage);

    return snsPublisher.publish({
      Message: strMessage,
      TopicArn: process.env.SNS_TOPIC_ARN,
    });
  });

  await Promise.all(promises);
}