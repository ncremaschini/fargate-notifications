deleted_queues=0
deleted_alarms=0
deleted_sns_subscriptions=0

queues=$(aws sqs list-queues --profile $PROFILE)
for q in ${queues[@]}
do
  if [ $q != "QUEUEURLS" ] && [ $q != "None" ]; then
    aws sqs delete-queue --queue-url $q --profile $PROFILE
    echo "deleted $q"
    ((deleted_queues++))
  fi
done

alarms=$(aws cloudwatch describe-alarms --alarm-name-prefix 'TooManyMessagesOn' --profile $PROFILE --query 'MetricAlarms[].AlarmName' --output text)
for alarm in ${alarms[@]}
do
  aws cloudwatch delete-alarms --alarm-names $alarm --profile $PROFILE
  echo "Deleted alarm: $alarm"
  ((deleted_alarms++))
done

sns_subscriptions=$(aws sns list-subscriptions --profile $PROFILE --query 'Subscriptions[?TopicArn==`arn:aws:sns:REGION:ACCOUNT_ID:fgtn-status-change`].SubscriptionArn' --output text)
for subscription in ${sns_subscriptions[@]}
do
  aws sns unsubscribe --subscription-arn $subscription --profile $PROFILE
  echo "Deleted subscription: $subscription"
  ((deleted_sns_subscriptions++))
done

echo "Deleted $deleted_queues queues"
echo "Deleted $deleted_alarms alarms"
echo "Deleted $deleted_sns_subscriptions sns subscriptions"






