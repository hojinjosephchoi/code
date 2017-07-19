var express = require('express');
var bodyParser = require('body-parser');
var AWS = require('aws-sdk');
var assert = require('assert-plus');
// 세피아 이미지 생성하는데 쓰임
var Caman = require('caman').Caman;
var fs = require('fs');

var lib = require('./lib.js');

// DynamoDB 엔드포인트 생성
var db = new AWS.DynamoDB({
  "region": "us-east-1"
});
// S3 엔드포인트 생성
var s3 = new AWS.S3({
  "region": "us-east-1"
});

var app = express();
app.use(bodyParser.json());

function getImage(id, cb) {
  db.getItem({
    "Key": {
      "id": {
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

// 빈 객체를 반환하는 헬스체크 경로 등록
app.get('/', function(request, response) {
  response.json({});
});

// 일래스틱 빈즈토크에 의해 큐에 데이터가 있을 경우 호출됨.
app.post('/sqs', function(request, response) {
  assert.string(request.body.imageId, "imageId");
  assert.string(request.body.desiredState, "desiredState");
  getImage(request.body.imageId, function(err, image) {
    if (err) {
      throw err;
    } else {
      if (typeof states[request.body.desiredState] === 'function') {
        // SQS 메시지의 desiredState가 processed와 일치하면 processed 함수 호출
        states[request.body.desiredState](image, request, response);
      } else {
        throw new Error("unsupported desiredState");
      }
    }
  });
});

var states = {
  "processed": processed
};

function processImage(image, cb) {
  var processedS3Key = 'processed/' + image.id + '-' + Date.now() + '.png';
  var rawFile = './tmp_raw_' + image.id;
  var processedFile = './tmp_processed_' + image.id;
  // S3에서 원시 이미지 다운로드
  s3.getObject({
    "Bucket": process.env.ImageBucket,
    "Key": image.rawS3Key
  }, function(err, data) {
    if (err) {
      cb(err);
    } else {
      fs.writeFile(rawFile, data.Body, {"encoding": null}, function(err) {
        if (err) {
          cb(err);
        } else {
          // 이미지처리
          Caman(rawFile, function () {
            this.brightness(10);
            this.contrast(30);
            this.sepia(60);
            this.saturation(-30);
            this.render(function() {
              this.save(processedFile);
              fs.unlink(rawFile, function() {
                fs.readFile(processedFile, {"encoding": null}, function(err, buf) {
                  if (err) {
                    cb(err);
                  } else {
                    // S3로 세피아 이미지 업로드
                    s3.putObject({
                      "Bucket": process.env.ImageBucket,
                      "Key": processedS3Key,
                      "ACL": "public-read",
                      "Body": buf,
                      "ContentType": "image/png"
                    }, function(err) {
                      console.log("s3.putObject", err); // TODO debug only
                      if (err) {
                        cb(err);
                      } else {
                        fs.unlink(processedFile, function() {
                          cb(null, processedS3Key);
                        });
                      }
                    });
                  }
                });
              });
            });
          });
        }
      });
    }
  });
}

function processed(image, request, response) {
  processImage(image, function(err, processedS3Key) {
    if (err) {
      throw err;
    } else {
      // DynamoDB updateItem 함수 호출
      db.updateItem({
        "Key": {
          "id": {
            "S": image.id
          }
        },
        // 상태, 버전, 처리된 S3키를 갱신
        "UpdateExpression": "SET #s=:newState, version=:newVersion, processedS3Key=:processedS3Key",
        // 아이템이 존재하고, 그 버전이 예상한 버전과 같고, 허용된 상태일 때만 갱신
        "ConditionExpression": "attribute_exists(id) AND version=:oldVersion AND #s IN (:stateUploaded, :stateProcessed)",
        "ExpressionAttributeNames": {
          "#s": "state"
        },
        "ExpressionAttributeValues": {
          ":newState": {
            "S": "processed"
          },
          ":oldVersion": {
            "N": image.version.toString()
          },
          ":newVersion": {
            "N": (image.version + 1).toString()
          },
          ":processedS3Key": {
            "S": processedS3Key
          },
          ":stateUploaded": {
            "S": "uploaded"
          },
          ":stateProcessed": {
            "S": "processed"
          }
        },
        "ReturnValues": "ALL_NEW",
        "TableName": "imagery-image"
      }, function(err, data) {
        if (err) {
          throw err;
        } else {
          // 프로세스의 새로운 상태를 응답
          response.json(lib.mapImage(data.Attributes));
        }
      });
    }
  });
}

app.listen(process.env.PORT || 8080, function() {
  console.log("Worker started on port " + (process.env.PORT || 8080));
});
