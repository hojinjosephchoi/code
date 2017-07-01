// 사용할 수 있는 AMI 목록 조회

var jmespath = require('jmespath');
var AWS = require('aws-sdk');

// EC2 엔드포인트 구성
var ec2 = new AWS.EC2({
	"region": "us-east-1"
});

module.exports = function(cb) {
	ec2.describeImages({
		"Filters": [{
			"Name": "description",
			"Values": ["Amazon Linux AMI 2017.03.1.???????? x86_64 HVM GP2"]
		}]
	}, function(err, data) {
		if (err) {
			cb(err);
		} else {
			var amiIds = jmespath.search(data, 'Images[*].ImageId');
			var descriptions = jmespath.search(data, 'Images[*].Description');
			cb(null, {"amiIds": amiIds, "descriptions": descriptions});
		}
	});
};
