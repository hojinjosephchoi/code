#!/bin/bash -ex

# install and configure NFS
yum -y install nfs-utils nfs-utils-lib
# rcpbind 시작 (NFS가 사용)
service rpcbind start
# NFS 데몬 시작
service nfs start
# 모든 사용자가 인스턴스 스토어 볼륨에 읽고 쓸 수 있도록 허용
chmod 777 /media/ephemeral0
# NFS를 통해 인스턴스 스토어 볼륨을 다른 NFS 클라이언트에 노출
echo "/media/ephemeral0 *(rw,async)" >> /etc/exports
# 변경된 export 구성을 적용하기 위해 재시작
exportfs -a

# wait until EBS volume is attached
# 백업용 EBS 볼륨을 사용할 수 있을 때까지 대기
while ! [ "$(fdisk -l | grep '/dev/xvdf' | wc -l)" -ge "1" ]; do sleep 10; done

# format EBS volume if needed
# 아직 ext4로 포맷되어있지 않다면 (즉, 서버를 처음 시작했다면) EBS 볼륨을 포맷
if [[ "$(file -s /dev/xvdf)" != *"ext4"* ]]
then
	mkfs -t ext4 /dev/xvdf
fi

# mount EBS volume
# 백업용 EBS 볼륨 마운트
mkdir /mnt/backup
echo "/dev/xvdf /mnt/backup ext4 defaults,nofail 0 2" >> /etc/fstab
mount -a


INSTANCEID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
# EBS 볼륨의 ID를 가져옴
VOLUMEID=$(aws --region $REGION ec2 describe-volumes --filters "Name=attachment.instance-id,Values=$INSTANCEID" --query "Volumes[0].VolumeId" --output text)

# backup cron
# EOF의 모든 텍스트를 cron job 정의로 복사. /etc/cron.d/에 cron job 정의가 저장됨.
cat > /etc/cron.d/backup << EOF
SHELL=/bin/bash
# /opt/aws/bin 경로가 PATH 환경벼누에 들어있어서 AWS를 사용할 수 있는지 확인
PATH=/sbin:/bin:/usr/sbin:/usr/bin:/opt/aws/bin
MAILTO=root
HOME=/
# 인스턴스 스토어 볼륨에서 EBS볼륨으로 모든파일 동기화 (매 15분 간격)
0,15,30,45 * * * * rsync -av --delete --exclude /media/ephemeral0/ /mnt/backup/ ; \
# 데이터 무결성을 위해 스냅샷 생성 전 EBS 볼륨 프리징
fsfreeze -f /mnt/backup/ ; \
# EBS 스냅샷 생성
aws --region $REGION ec2 create-snapshot --volume-id $VOLUMEID --description "NFS backup"; \
# EBS 볼륨 프리징 해제
fsfreeze -u /mnt/backup/
EOF
