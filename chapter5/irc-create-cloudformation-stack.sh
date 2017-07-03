#!/bin/bash -ex

# 기본 VPC를 얻어 $vpc 변수에 저장
vpc=$(aws ec2 describe-vpcs --filter "Name=isDefault, Values=true" --query "Vpcs[0].VpcId" --output text)

# CloudFormation 스택을 생성한다.
aws cloudformation create-stack --stack-name irc --template-url https://s3.amazonaws.com/awsinaction/chapter5/irc-cloudformation.json --parameters ParameterKey=VPC,ParameterValue=$vpc

# 상태가 COMPLETE가 아니면 10초 후 재시도 한다.
while [[ `aws cloudformation describe-stacks --stack-name irc --query Stacks[0].StackStatus` != *"COMPLETE"* ]]
do
	sleep 10
done
