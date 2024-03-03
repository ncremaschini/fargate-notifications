import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";

import { ApplicatioProps, ConfigProps } from "./config";

import { FargateNotificationsStack } from "./fargate-notifications-stack";

export function createSqsProcessorTimetakenMetric(
  stack: FargateNotificationsStack,
  appProps: ApplicatioProps,
  configProps: ConfigProps
) {
  new logs.MetricFilter(stack, "fgnt-sqs-processor-metric-filter-1", {
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

  new logs.MetricFilter(stack, "fgnt-sqs-processor-metric-filter-3", {
    logGroup: appProps.queueProcessorLogGroup!,
    metricNamespace: "Fgnt",
    metricName: "openPollings",
    filterPattern: logs.FilterPattern.exists("$.openPollings"),
    metricValue: "$.openPollings",
    defaultValue: 0,
    unit: cloudwatch.Unit.COUNT,
  });

  new logs.MetricFilter(stack, "fgnt-sqs-processor-metric-filter-4", {
    logGroup: appProps.queueProcessorLogGroup!,
    metricNamespace: "Fgnt",
    metricName: "processedMessages",
    filterPattern: logs.FilterPattern.exists("$.processedMessages"),
    metricValue: "$.processedMessages",
    defaultValue: 0,
    unit: cloudwatch.Unit.COUNT,
  });

  new logs.MetricFilter(stack, "fgnt-sqs-processor-metric-filter-5", {
    logGroup: appProps.queueProcessorLogGroup!,
    metricNamespace: "Fgnt",
    metricName: "discardedMessages",
    filterPattern: logs.FilterPattern.exists("$.discardedMessages"),
    metricValue: "$.discardedMessages",
    defaultValue: 0,
    unit: cloudwatch.Unit.COUNT,
  });
}
