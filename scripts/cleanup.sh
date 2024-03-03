queues=$(aws sqs list-queues --profile $PROFILE)
for q in ${queues[@]}
do
  if [ $q != "QUEUEURLS" ] && [ $q != "None" ]; then
    aws sqs delete-queue --queue-url $q --profile $PROFILE
    echo "deleted $q"
  fi
done

alarms=$(aws cloudwatch describe-alarms --alarm-name-prefix 'TooManyMessagesOn' --profile $PROFILE --query 'MetricAlarms[].AlarmName' --output text)
for alarm in ${alarms[@]}
do
  aws cloudwatch delete-alarms --alarm-names $alarm --profile $PROFILE
  echo "Deleted alarm: $alarm"
done

sns_subscriptions=$(aws sns list-subscriptions --profile $PROFILE --query 'Subscriptions[?TopicArn==`arn:aws:sns:REGION:ACCOUNT_ID:fgtn-status-change`].SubscriptionArn' --output text)
for subscription in ${sns_subscriptions[@]}
do
  aws sns unsubscribe --subscription-arn $subscription --profile $PROFILE
  echo "Deleted subscription: $subscription"
done

#echo the number of deleted queues, alarms, and sns subscriptions
echo "Deleted $(echo $queues | wc -w) queues"
echo "Deleted $(echo $alarms | wc -w) alarms"
echo "Deleted $(echo $sns_subscriptions | wc -w) sns subscriptions"





