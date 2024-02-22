queues=$(aws sqs list-queues --profile $PROFILE)
for q in ${queues[@]}
do
  if [ $q != "QUEUEURLS" ] && [ $q != "None" ]; then
    echo "aws sqs delete-queue --queue-url $q --profile $PROFILE"
    aws sqs delete-queue --queue-url $q --profile $PROFILE
    echo "deleted $q"
  fi
done
