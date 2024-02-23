queues=$(aws sqs list-queues --profile $PROFILE)
for q in ${queues[@]}
do
  if [ $q != "QUEUEURLS" ] && [ $q != "None" ]; then
    echo "aws sqs delete-queue --queue-url $q --profile $PROFILE"
    aws sqs delete-queue --queue-url $q --profile $PROFILE
    echo "deleted $q"
  fi
done

alarms=$(aws cloudwatch describe-alarms --alarm-name-prefix 'TooManyMessagesOn' --profile $PROFILE --query 'MetricAlarms[].AlarmName' --output text)
for alarm in ${alarms[@]}
do
  echo "aws cloudwatch delete-alarms --alarm-names $alarm --profile $PROFILE"
  aws cloudwatch delete-alarms --alarm-names $alarm --profile $PROFILE
  echo "Deleted alarm: $alarm"
done

sns_subscriptions=$(aws sns list-subscriptions --profile $PROFILE --query 'Subscriptions[?TopicArn==`arn:aws:sns:REGION:ACCOUNT_ID:fgtn-status-change`].SubscriptionArn' --output text)
for subscription in ${sns_subscriptions[@]}
do
  echo "aws sns unsubscribe --subscription-arn $subscription --profile $PROFILE"
  aws sns unsubscribe --subscription-arn $subscription --profile $PROFILE
  echo "Deleted subscription: $subscription"
done



