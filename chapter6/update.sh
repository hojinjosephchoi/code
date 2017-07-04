#!/bin/bash -ex

# 실행중인 EC2 인스턴스의 모든 공개이름 (public name) 얻기
PUBLICNAMES=$(aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" --query "Reservations[].Instances[].PublicDnsName" --output text)

for PUBLICNAME in $PUBLICNAMES; do
	ssh -t -o StrictHostKeyChecking=no ec2-user@$PUBLICNAME "sudo yum -y --security update"
done
