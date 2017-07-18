// 메시지를 SQS 큐에 보내기
var AWS = require('aws-sdk');
var uuid = require('node-uuid');
var config = require('./config.json');
// SQS 엔드포인트 생성
var sqs = new AWS.SQS({
	"region": "us-east-1"
});

// URL이 제공됐는지 여부 확인
if (process.argv.length !== 3) {
	console.log('URL missing');
	process.exit(1);
}

// 랜덤 ID 생성
var id = uuid.v4();

// 페이로드는 임의의 ID와 URL
var body = {
	"id": id,
	"url": process.argv[2]
};

// SQS의 sendMessage 함수 호출
// 페이로드를 JSON 스트링으로 변환
// 메시지를 전송할 큐
sqs.sendMessage({
	"MessageBody": JSON.stringify(body),
	"QueueUrl": config.QueueUrl
}, function(err) {
	if (err) {
		console.log('error', err);
	} else {
		console.log('PNG will be soon available at http://' + config.Bucket + '.s3-website-us-east-1.amazonaws.com/' + id + '.png');
	}
});
