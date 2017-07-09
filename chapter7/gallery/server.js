var express = require("express");
// AWS SDK 삽입
var AWS = require("aws-sdk");
var mu = require("mu2-updated");
var uuid = require("uuid");
var multiparty = require("multiparty");

var app = express();

// AWS SDK 중 s3 구성
var s3 = new AWS.S3({
	"region": "us-east-1"
});

var bucket = process.argv[2];
if (!bucket || bucket.length < 1) {
	console.error("Missing S3 bucket. Start with node server.js BUCKETNAME instead.");
	process.exit(1);
}

function listImages(response) {

	// 객체 목록을 얻기 위한 매개변수 정의
	var params = {
		Bucket: bucket
	};
	// 객체 목록 얻기
	s3.listObjects(params, function(err, data) {
		if (err) {
			console.error(err);
			response.status(500);
			response.send("Internal server error.");
		} else {

			console.log(data);
			var stream = mu.compileAndRender(
				"index.html", 
				{
					Objects: data.Contents, 
					Bucket: bucket
				}
			);
			stream.pipe(response);
		}
	});
}

function uploadImage(image, response) {
	var params = {
		// image 콘텐트
		Body: image,
		// 버킷 명
		Bucket: bucket,
		// 객체의 고유 키 생성
		Key: uuid.v4(),
		// 모든 사람이 버킷 안의 이미지를 읽을 수 있게 허용
		ACL: "public-read",
		// 이미지 크기 (바이트 단위)
		ContentLength: image.byteCount,
		// 콘텐츠 타입
		ContentType: image.headers["content-type"]
	};

	// S3에 이미지 업로드
	s3.putObject(params, function(err, data) {
		if (err) {
			// 오류시
			console.error(err);
			response.status(500);
			response.send("Internal server error.");
		} else {
			// 성공시
			response.redirect("/");
		}
	});
}

app.get('/', function (request, response) {
	listImages(response);
});

app.post('/upload', function (request, response) {
	var form = new multiparty.Form();
	form.on("part", function(part) {
		uploadImage(part, response);
	});
	form.parse(request);
});
 
app.listen(8080);

console.log("Server started. Open http://localhost:8080 with browser.");
