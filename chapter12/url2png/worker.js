var fs = require('fs');
var AWS = require('aws-sdk');
var webshot = require('webshot');
var config = require('./config.json');
var sqs = new AWS.SQS({
	"region": "us-east-1"
});
var s3 = new AWS.S3({
	"region": "us-east-1"
});

function acknowledge(message, cb) {
	var params = {
		"QueueUrl": config.QueueUrl,
		// ReceiptHandle은 메시지의 영수증으로, 고유한 값을 가짐
		"ReceiptHandle": message.ReceiptHandle
	};
	// deleteMessage 함수 호출
	sqs.deleteMessage(params, cb);
}

// 메시지 처리단계
function process(message, cb) {
	// 메시지 본문은 JSON 문자열. 이를 다시 javascript 객체로 변환
	var body = JSON.parse(message.Body);
	var file = body.id + '.png';
	// webshot 모듈을 이용해서 스크린샷 생성
	webshot(body.url, file, function(err) {
		if (err) {
			cb(err);
		} else {
			// webshot 모듈이 로컬 디스크에 저장한 스크린샷 열기
			fs.readFile(file, function(err, buf) {
				if (err) {
					cb(err);
				} else {
					var params = {
						"Bucket": config.Bucket,
						"Key": file,
						// 모든 사람이 S3의 스크린샷을 읽을 수 있도록 허용
						"ACL": "public-read",
						"ContentType": "image/png",
						"Body": buf
					};
					s3.putObject(params, function(err) {
						if (err) {
							cb(err);
						} else {
							// 로컬 디스크에서 스크린샷 제거
							fs.unlink(file, cb);
						}
					});
				}
			});
		}
	});
}

// 메시지 수신단계
function receive(cb) {
	var params = {
		"QueueUrl": config.QueueUrl,
		// 한 번에 최대 1개의 메시지만 소비
		"MaxNumberOfMessages": 1,
		// 120초 동안 큐에서 메시지 취득
		"VisibilityTimeout": 120,
		// 새로운 메시지를 기다리기 위해 10초간 롱 폴링
		"WaitTimeSeconds": 10
	};
	// SQS의 receiveMessage 함수 호출
	sqs.receiveMessage(params, function(err, data) {
		if (err) {
			cb(err);
		} else {
			// 메시지 존재여부 검사
			if (data.Messages === undefined) {
				cb(null, null);
			} else {
				// 첫 번째 메시지 얻기
				cb(null, data.Messages[0]);
			}
		}
	});
}

function run() {
	// 메시지 수신
	receive(function(err, message) {
		if (err) {
			throw err;
		} else {
			if (message === null) {
				console.log('nothing to do');
				// 1초 후 다시 run 메소드 호출
				setTimeout(run, 1000);
			} else {
				// 메시지 처리
				console.log('process');
				process(message, function(err) {
					if (err) {
						throw err;
					} else {
						// 성공적인 메시지 처리 승인
						acknowledge(message, function(err) {
							if (err) {
								throw err;
							} else {
								// 1초 후 다시 run 메소드 호출
								console.log('done');
								setTimeout(run, 1000);
							}
						});
					}
				});
			}
		}
	});
}

run();
