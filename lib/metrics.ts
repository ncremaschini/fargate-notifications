import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";

import { ApplicatioProps, ConfigProps } from "./config";

import { FargateNotificationsStack } from "./fargate-notifications-stack";

export function createSqsProcessorTimetakenMetric(
  stack: FargateNotificationsStack,
  appProps: ApplicatioProps,
  configProps: ConfigProps
) {
  new logs.MetricFilter(stack, "fgnt-sqs-processor-metric-filter", {
    logGroup: appProps.queueProcessorLogGroup!,
    metricNamespace: "Fgnt",
    metricName: "sqsTimeTaken",
    filterPattern: logs.FilterPattern.exists("$.sqsTimeTakenInMillis"),
    metricValue: "$.sqsTimeTakenInMillis",
    defaultValue: 0,
    unit: cloudwatch.Unit.MILLISECONDS,
  });

  new logs.MetricFilter(stack, "fgnt-sqs-processor-metric-filter-2", {
    logGroup: appProps.queueProcessorLogGroup!,
    metricNamespace: "Fgnt",
    metricName: "snsTimeTaken",
    filterPattern: logs.FilterPattern.exists("$.snsTimeTakenInMillis"),
    metricValue: "$.snsTimeTakenInMillis",
    defaultValue: 0,
    unit: cloudwatch.Unit.MILLISECONDS,
  });
}
