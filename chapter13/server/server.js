var express = require('express');
var bodyParser = require('body-parser');
var AWS = require('aws-sdk');
var uuid = require('node-uuid');
var multiparty = require('multiparty');

var lib = require('./lib.js');

// DynamoDB 엔드포인트 생성
var db = new AWS.DynamoDB({
  "region": "us-east-1"
});
// SQS 엔드포인트 생성
var sqs = new AWS.SQS({
  "region": "us-east-1"
});
// S3 엔드포인트 생성
var s3 = new AWS.S3({
  "region": "us-east-1"
});

// express 앱을 생성하고, express에 요청본문을 파싱하라고 알려줌
var app = express();
app.use(bodyParser.json());
app.use(express.static('public'));


function getImage(id, cb) {
  // DynamoDB getItem 함수 호출
  db.getItem({
    "Key": {
      "id": {
        // id는 기본 해시키
        "S": id
      }
    },
    "TableName": "imagery-image"
  }, function(err, data) {
    if (err) {
      cb(err);
    } else {
      if (data.Item) {
        cb(null, lib.mapImage(data.Item));
      } else {
        cb(new Error("image not found"));
      }
    }
  });
}

function uploadImage(image, part, response) {
  // S3 객체의 키 생성
  var rawS3Key = 'upload/' + image.id + '-' + Date.now();
  // S3의 putObject 함수 호출
  s3.putObject({
    // S3 버킷 명은 환경변수로 전달
    "Bucket": process.env.ImageBucket,
    "Key": rawS3Key,
    // Body는 업로드 된 데이터 스트림
    "Body": part,
    "ContentLength": part.byteCount
  }, function(err, data) {
    if (err) {
      throw err;
    } else {
      // 버킷에 업로드 후 DynamoDB updateItem 호출
      db.updateItem({
        "Key": {
          "id": {
            "S": image.id
          }
        },
        // 상태, 버전, 원시 S3 키 갱신
        "UpdateExpression": "SET #s=:newState, version=:newVersion, rawS3Key=:rawS3Key",
        // 아이템이 존재하고, 그 버전이 예상 버전과 같고, 허용된 상태일 때만 갱신함
        "ConditionExpression": "attribute_exists(id) AND version=:oldVersion AND #s IN (:stateCreated, :stateUploaded)",
        "ExpressionAttributeNames": {
          "#s": "state"
        },
        "ExpressionAttributeValues": {
          ":newState": {
            "S": "uploaded"
          },
          ":oldVersion": {
            "N": image.version.toString()
          },
          ":newVersion": {
            "N": (image.version + 1).toString()
          },
          ":rawS3Key": {
            "S": rawS3Key
          },
          ":stateCreated": {
            "S": "created"
          },
          ":stateUploaded": {
            "S": "uploaded"
          }
        },
        "ReturnValues": "ALL_NEW",
        "TableName": "imagery-image"
      }, function(err, data) {
        if (err) {
           throw err;
        } else {
          // SQS의 sendMessage 함수 호출
          sqs.sendMessage({
            // 메시지는 process ID 포함
            "MessageBody": JSON.stringify({"imageId": image.id, "desiredState": "processed"}),
            // SQS URL을 환경변수로 전달
            "QueueUrl": process.env.ImageQueue,
          }, function(err) {
            if (err) {
              throw err;
            } else {
              //response.json(lib.mapImage(data.Attributes));
              response.redirect('/#view=' + image.id);
              response.end();
            }
          });
        }
      });
    }
  });
}

// 새로운 이미지 프로세스가 생성됨
app.post('/image', function(request, response) {
  
  // 해당 프로세스에 고유ID 생성
  var id = uuid.v4();
  // DynamoDB putItem 함수 호출
  db.putItem({
    "Item": {
      "id": {
        // id 속성은 DynamoDB에서 기본키에 해당
        "S": id
      },
      // 낙관적 락킹용 버전 사용
      "version": {
        "N": "0"
      },
      "created": {
        "N": Date.now().toString()
      },
      // 프로세스는 이제 created 상태. 이 속성은 상태전환이 일어날 때 변경한다.
      "state": {
        "S": "created"
      }
    },
    "TableName": "imagery-image",
    // 아이템이 이미 있다면 교체되는 것 방지
    "ConditionExpression": "attribute_not_exists(id)"
  }, function(err, data) {
    if (err) {
      throw err;
    } else {
      response.json({"id": id, "state": "created"});
    }
  });
});

// 경로 매개변수(:id)로 지정한 프로세스의 상태를 반환한다.
app.get('/image/:id', function(request, response) {
  getImage(request.params.id, function(err, image) {
    if (err) {
      throw err;
    } else {
      // 이미지 프로세스 응답
      response.json(image);
    }
  });
});

// 경로 매개변수(:id)로 지정한 프로세스에 파일 업로드를 제공한다. 
app.post('/image/:id/upload', function(request, response) {
  getImage(request.params.id, function(err, image) {
    if (err) {
      throw err;
    } else {
      // 실제 업로드를 처리하는 부분
      var form = new multiparty.Form();
      form.on('part', function(part) {
        uploadImage(image, part, response);
      });
      form.parse(request);
    }
  });
});

app.listen(process.env.PORT || 8080, function() {
  console.log("Server started. Open http://localhost:" + (process.env.PORT || 8080) + " with browser.");
});
