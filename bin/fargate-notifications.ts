#!/usr/bin/env node

import 'source-map-support/register';

import * as cdk from 'aws-cdk-lib';

import { FargateNotificationsStack } from '../lib/fargate-notifications-stack';
import { Tags } from 'aws-cdk-lib';

const app = new cdk.App();

new FargateNotificationsStack(app, 'FargateNotificationsStack', {});
Tags.of(app).add("app", "fargate-notification");