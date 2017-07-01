#!/bin/bash -e
# You need to install the AWS Command Line Interface from http://aws.amazon.com/cli/

# 아마존 리눅스 AMI의 ID를 얻는다.
AMIID=$(aws ec2 describe-images --filters "Name=description, Values=Amazon Linux AMI 2015.03.? x86_64 HVM GP2" --query "Images[0].ImageId" --output text)

# 기본 VPC ID를 얻는다.
VPCID=$(aws ec2 describe-vpcs --filter "Name=isDefault, Values=true" --query "Vpcs[0].VpcId" --output text)

# 기본 서브넷 ID를 얻는다.
SUBNETID=$(aws ec2 describe-subnets --filters "Name=vpc-id, Values=$VPCID" --query "Subnets[0].SubnetId" --output text)

# 보안그룹을 생성한다.
SGID=$(aws ec2 create-security-group --group-name mysecuritygroup --description "My security group" --vpc-id $VPCID --output text)

# 들어오는 SSH 연결을 허용한다.
aws ec2 authorize-security-group-ingress --group-id $SGID --protocol tcp --port 22 --cidr 0.0.0.0/0

# 서버를 생성하고 시작한다.
INSTANCEID=$(aws ec2 run-instances --image-id $AMIID --key-name mykey --instance-type t2.micro --security-group-ids $SGID --subnet-id $SUBNETID --query "Instances[0].InstanceId" --output text)

# 서버가 시작할 때 까지 대기한다.
echo "waiting for $INSTANCEID ..."
aws ec2 wait instance-running --instance-ids $INSTANCEID

# 서버의 공용이름을 얻는다.
PUBLICNAME=$(aws ec2 describe-instances --instance-ids $INSTANCEID --query "Reservations[0].Instances[0].PublicDnsName" --output text)

echo "$INSTANCEID is accepting SSH connections under $PUBLICNAME"
echo "ssh -i mykey.pem ec2-user@$PUBLICNAME"
read -p "Press [Enter] key to terminate $INSTANCEID ..."

# 서버를 종료한다.
aws ec2 terminate-instances --instance-ids $INSTANCEID
echo "terminating $INSTANCEID ..."

# 서버가 종료될 때까지 대기한다.
aws ec2 wait instance-terminated --instance-ids $INSTANCEID

# 보안그룹을 삭제한다.
aws ec2 delete-security-group --group-id $SGID

echo "done."
