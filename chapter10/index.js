var fs = require('fs');
var docopt = require('docopt');
var moment = require("moment");
var AWS = require('aws-sdk');
var db = new AWS.DynamoDB({
	"region": "us-east-1"
});

// CLI 설명 읽기 
var cli = fs.readFileSync('./cli.txt', {"encoding": "utf8"});
// 인수를 파싱하고 input 변수에 저장 
var input = docopt.docopt(cli, { 
	"version": "1.0", 
	"argv": process.argv.splice(2)
});

// 선택 속성에 접근할 수 있는 헬퍼 함수
function getValue(attribute, type) {
	if (attribute === undefined) {
		return null;
	}
	return attribute[type];
}

// DynamoDB의 결과를 변형해주는 헬퍼 함수 
function mapTaskItem(item) {
	return {
		"tid": item.tid.N,
		"description": item.description.S,
		"created": item.created.N,
		"due": getValue(item.due, 'N'),
		"category": getValue(item.category, 'S'),
		"completed": getValue(item.completed, 'N')
	};
}

// DynamoDB 결과를 변형해주는 헬퍼 함수 
function mapUserItem(item) {
	return {
		"uid": item.uid.S,
		"email": item.email.S,
		"phone": item.phone.S
	};
}

if (input['user-add'] === true) {
	var params = {
		"Item": {
			// 문자열은 S로 표기
			// 속성은 uid, email, phone을 보낸다.
			"uid": {
				"S": input['<uid>']
			},
			"email": {
				"S": input['<email>']
			},
			"phone": {
				"S": input['<phone>']
			}
		},
		// 아이템을 todo-user 테이블에 추가
		"TableName": "todo-user",
		// 같은 키로 putItem을 두번 호출하면 데이터가 대체된다.
		// ConditionExpression은 키가 아직 존재하지 않을 때만 putItem이 동작하게 한다.
		"ConditionExpression": "attribute_not_exists(uid)"
	};
	// DynamoDB에 putItem 함수를 호출하여 아이템을 추가. 
	db.putItem(params, function(err) {
		if (err) {
			console.error('error', err);
		} else {
			console.log('user added with uid ' + input['<uid>']);
		}
	});
} else if (input['user-rm'] === true) {
	var params = {
		"Key": {
			// 파티션 키로 아이템 식별
			"uid": {
				"S": input['<uid>']
			}
		},
		// 사용자 테이블 지정
		"TableName": "todo-user"
	};
	// DynamoDB deleteItem 함수를 호출하여 아이템 삭제
	db.deleteItem(params, function(err) {
		if (err) {
			console.error('error', err);
		} else {
			console.log('user removed with uid ' + input['<uid>']);
		}
	});
} else if (input['user-ls'] === true) {
	var params = {
		"TableName": "todo-user",
		// 한번에 반환할 최대 아이템 수
		"Limit": input['--limit']
	};
	if (input['--next'] !== null) {
		// next 매개변수에는 마지막 평가된 키가 저장된다. 
		params.ExclusiveStartKey = {
			"uid": {
				"S": input['--next']
			}
		};
	}
	// DynamoDB scan함수를 호출해서 전체 테이블의 아이템을 조회한다.
	db.scan(params, function(err, data) {
		if (err) {
			console.error('error', err);
		} else {
			console.log('users', data.Items.map(mapUserItem));
			// 마지막 아이템이 도달했는지 확인.
			if (data.LastEvaluatedKey !== undefined) {
				console.log('more users available with --next=' + data.LastEvaluatedKey.uid.S);
			}
		}
	});
} else if (input['user'] === true) {
	var params = {
		"Key": {
			// 기본 uid키로 사용자 검색
			"uid": {
				"S": input['<uid>']
			}
		},
		// 사용자 테이블 지정
		"TableName": "todo-user"
	};
	// DynamoDB의 getItem 함수 호출하여 조회
	db.getItem(params, function(err, data) {
		if (err) {
			console.error('error', err);
		} else {
			// 기본 키로 데이터를 찾았는지 확인 
			if (data.Item) {
				console.log('user with uid ' + input['<uid>'], mapUserItem(data.Item));
			} else {
				console.error('user with uid ' + input['<uid>'] + ' not found');
			}
		}
	});
} else if (input['task-add'] === true) {
	// 현재의 타임스템프에 의해 태스크 ID를 생성한다.
	var tid = Date.now();
	var params = {
		"Item": {
			"uid": {
				"S": input['<uid>']
			},
			// 태스크ID는 숫자타입이다.
			"tid": {
				"N": tid.toString()
			},
			"description": {
				"S": input['<description>']
			},
			// created 속성은 숫자타입이며 YYYYMMDD형태이다.
			"created": {
				"N": moment().format("YYYYMMDD")
			}
		},
		// todo-task에 저장한다.
		"TableName": "todo-task",
		"ConditionExpression": "attribute_not_exists(uid) and attribute_not_exists(tid)"
	};
	// 선택 매개변수인 dueat이 설정되면 이 값도 아이템에 추가한다.
	if (input['--dueat'] !== null) {
		params.Item.due = {
			"N": input['--dueat']
		};
	}
	// 선택 매개변수인 category가 설정되면 이 값도 아이템에 추가한다.
	if (input['<category>'] !== null) {
		params.Item.category = {
			"S": input['<category>']
		};
	}
	// DynamoDB putItem을 호출하여 Insert 작업을 수행한다.
	db.putItem(params, function(err) {
		if (err) {
			console.error('error', err);
		} else {
			console.log('task added with tid ' + tid);
		}
	});
} else if (input['task-rm'] === true) {
	var params = {
		"Key": {
			// 복합 기본키로 아이템 식별
			"uid": {
				"S": input['<uid>']
			},
			"tid": {
				"N": input['<tid>']
			}
		},
		"TableName": "todo-task"
	};
	db.deleteItem(params, function(err) {
		if (err) {
			console.error('error', err);
		} else {
			console.log('task removed with tid ' + input['<tid>']);
		}
	});
} else if (input['task-ls'] === true) {
	var params = {
		// 기본 카 질의. 태스크 테이블은 복합 기본키를 사용한다.
		// 질의에 해시만 정의되어있으므로 모든 범위가 반환된다.
		"KeyConditionExpression": "uid = :uid",
		"ExpressionAttributeValues": {
			// 질의 속성은 반드시 이런 식으로 전달해야 한다.
			":uid": {
				"S": input['<uid>']
			}
		},
		"TableName": "todo-task",
		"Limit": input['--limit']
	};
	if (input['--next'] !== null) {
		params.KeyConditionExpression += ' AND tid > :next';
		params.ExpressionAttributeValues[':next'] = {
			"N": input['--next']
		};
	}
	
	if (input['--overdue'] === true) {
		// 필터링은 인덱스를 사용하지 않는다.
		// 필터는 기본키 질의가 반환하는 모든 원소에 적용된다.
		params.FilterExpression = "due < :yyyymmdd";
		// 필터 속성은 반드시 이런 식으로 전달해야 한다.
		params.ExpressionAttributeValues[':yyyymmdd'] = {"N": moment().format("YYYYMMDD")};
	} else if (input['--due'] === true) {
		params.FilterExpression = "due = :yyyymmdd";
		params.ExpressionAttributeValues[':yyyymmdd'] = {"N": moment().format("YYYYMMDD")};
	} else if (input['--withoutdue'] === true) {
		params.FilterExpression = "attribute_not_exists(due)";
	} else if (input['--futuredue'] === true) {
		params.FilterExpression = "due > :yyyymmdd";
		params.ExpressionAttributeValues[':yyyymmdd'] = {"N": moment().format("YYYYMMDD")};
	} else if (input['--dueafter'] !== null) {
		params.FilterExpression = "due > :yyyymmdd";
		params.ExpressionAttributeValues[':yyyymmdd'] = {"N": input['--dueafter']};
	} else if (input['--duebefore'] !== null) {
		params.FilterExpression = "due < :yyyymmdd";
		params.ExpressionAttributeValues[':yyyymmdd'] = {"N": input['--duebefore']};
	}
	if (input['<category>'] !== null) {
		if (params.FilterExpression === undefined) {
			params.FilterExpression = '';
		} else {
			// 논리 연산자로 여러 필터를 조합할 수 있다.
			params.FilterExpression += ' AND ';
		}
		params.FilterExpression += 'category = :category';
		params.ExpressionAttributeValues[':category'] = {
			"S": input['<category>']
		};
	}
	// DynamoDB의 query 함수를 사용하여 데이터를 조회한 후 필터링한다.
	db.query(params, function(err, data) {
		if (err) {
			console.error('error', err);
		} else {
			console.log('tasks', data.Items.map(mapTaskItem));
			if (data.LastEvaluatedKey !== undefined) {
				console.log('more tasks available with --next=' + data.LastEvaluatedKey.tid.N);
			}
		}
	});
} else if (input['task-la'] === true) {
	var params = {
		// 인덱스에 대한 질의는 기본키에 대한 질의와 동일하게 작동한다.
		"KeyConditionExpression": "category = :category",
		"ExpressionAttributeValues": {
			":category": {
				"S": input['<category>']
			}
		},
		"TableName": "todo-task",
		// 단, 사용하려는 인덱스를 지정해야 한다.
		"IndexName": "category-index",
		"Limit": input['--limit']
	};
	if (input['--next'] !== null) {
		params.KeyConditionExpression += ' AND tid > :next';
		params.ExpressionAttributeValues[':next'] = {
			"N": input['--next']
		};
	}
	if (input['--overdue'] === true) {
		// 필터링은 기본 키와 동일하게 작동한다.
		params.FilterExpression = "due < :yyyymmdd";
		params.ExpressionAttributeValues[':yyyymmdd'] = {"N": moment().format("YYYYMMDD")};
	} else if (input['--due'] === true) {
		params.FilterExpression = "due = :yyyymmdd";
		params.ExpressionAttributeValues[':yyyymmdd'] = {"N": moment().format("YYYYMMDD")};
	} else if (input['--withoutdue'] === true) {
		params.FilterExpression = "attribute_not_exists(due)";
	} else if (input['--futuredue'] === true) {
		params.FilterExpression = "due > :yyyymmdd";
		params.ExpressionAttributeValues[':yyyymmdd'] = {"N": moment().format("YYYYMMDD")};
	} else if (input['--dueafter'] !== null) {
		params.FilterExpression = "due > :yyyymmdd";
		params.ExpressionAttributeValues[':yyyymmdd'] = {"N": input['--dueafter']};
	} else if (input['--duebefore'] !== null) {
		params.FilterExpression = "due < :yyyymmdd";
		params.ExpressionAttributeValues[':yyyymmdd'] = {"N": input['--duebefore']};
	}
	db.query(params, function(err, data) {
		if (err) {
			console.error('error', err);
		} else {
			console.log('tasks', data.Items.map(mapTaskItem));
			if (data.LastEvaluatedKey !== undefined) {
				console.log('more tasks available with --next=' + data.LastEvaluatedKey.tid.N);
			}
		}
	});
} else if (input['task-done'] === true) {
	var params = {
		"Key": {
			// 복합 기본키로 아이템 식별
			"uid": {
				"S": input['<uid>']
			},
			"tid": {
				"N": input['<tid>']
			}
		},
		// 갱신할 속성 정의 (SET : 속성을 새로만들거나 기존 속성 덮어쓰기, REMOVE : 속성 제거)
		"UpdateExpression": "SET completed = :yyyymmdd",
		"ExpressionAttributeValues": {
			":yyyymmdd": {
				"N": moment().format("YYYYMMDD")
			}
		},
		"TableName": "todo-task"
	};
	// DynamoDB updateItem을 호출하여 아이템을 갱신한다. 
	db.updateItem(params, function(err) {
		if (err) {
			console.error('error', err);
		} else {
			console.log('task completed with tid ' + input['<tid>']);
		}
	});
}
