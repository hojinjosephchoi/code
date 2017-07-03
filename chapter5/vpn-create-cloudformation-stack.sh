#!/bin/bash -ex

# 기본 VPC를 얻는다.
vpc=$(aws ec2 describe-vpcs --filter "Name=isDefault, Values=true" --query "Vpcs[0].VpcId" --output text)

# 기본 서브넷을 얻는다.
subnet=$(aws ec2 describe-subnets --filters Name=vpc-id,Values=$vpc --query Subnets[0].SubnetId --output text)

# 임의 공유 비밀을 생성한다.
sharedsecret=$(openssl rand -base64 30)
user=vpn

# 임의 비밀번호를 생성한다.
password=$(openssl rand -base64 30)

# CloudFormation 스택을 생성한다.
aws cloudformation create-stack --stack-name vpn --template-url https://s3.amazonaws.com/awsinaction/chapter5/vpn-cloudformation.json --parameters ParameterKey=KeyName,ParameterValue=aws_n_virginia ParameterKey=VPC,ParameterValue=$vpc ParameterKey=Subnet,ParameterValue=$subnet ParameterKey=IPSecSharedSecret,ParameterValue=$sharedsecret ParameterKey=VPNUser,ParameterValue=$user ParameterKey=VPNPassword,ParameterValue=$password

# 상태가 COMPLETE가 아니면 잠시후에 재시도한다.
while [[ `aws cloudformation describe-stacks --stack-name vpn --query Stacks[0].StackStatus` != *"COMPLETE"* ]]
do
	sleep 10
done

# VPN서버의 공인 IP주소, 공유 비밀, VPN 사용자 이름, VPN 비밀번호를 출력
aws cloudformation describe-stacks --stack-name vpn --query Stacks[0].Outputs
