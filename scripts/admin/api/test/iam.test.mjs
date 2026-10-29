// コードが呼ぶ AWS のコマンドが、すべて template.yaml の IAM で許されているか（漏れるとデプロイ後に初めて落ちる）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const code = ['../../lib/reads.mjs', '../../lib/aws.mjs', '../../report/src/collect.mjs'].map(read).join('\n');
const tpl = read('../template.yaml');

// コマンド名 → IAM のアクション。Lambda で通らない道（health の DescribeLogGroups・Discord の送信系）は除く
const ACTION = {
  ListObjectsV2Command: 's3:ListBucket', GetObjectCommand: 's3:GetObject',
  ListUsersCommand: 'cognito-idp:ListUsers', DescribeUserPoolCommand: 'cognito-idp:DescribeUserPool',
  GetAccountCommand: 'ses:GetAccount', FilterLogEventsCommand: 'logs:FilterLogEvents',
  StartQueryCommand: 'logs:StartQuery', GetQueryResultsCommand: 'logs:GetQueryResults',
  GetMetricDataCommand: 'cloudwatch:GetMetricData', QueryCommand: 'dynamodb:Query', ScanCommand: 'dynamodb:Scan',
  UpdateItemCommand: 'dynamodb:UpdateItem', GetParameterCommand: 'ssm:GetParameter',
};
const NOT_IN_LAMBDA = new Set(['DescribeLogGroupsCommand', 'PutParameterCommand']);

test('コードが使うコマンドはすべて IAM で許されている', () => {
  const used = new Set([...code.matchAll(/(?:cmd\.|new )([A-Z]\w+Command)\b/g)].map((m) => m[1]));
  for (const c of used) {
    if (NOT_IN_LAMBDA.has(c)) continue;
    assert.ok(ACTION[c], `対応表に無いコマンド: ${c}`);
    assert.ok(tpl.includes(ACTION[c]), `template.yaml に ${ACTION[c]} が無い（${c}）`);
  }
});

test('DynamoDB の読み取りは項目を指定している（IAM の条件で全項目の取得を禁止している）', () => {
  const reads = [...read('../../lib/reads.mjs').matchAll(/new cmd\.(Scan|Query)Command\(\{([\s\S]*?)\}\)\)/g)];
  assert.ok(reads.length >= 3);
  for (const [, , body] of reads) assert.match(body, /Select: 'SPECIFIC_ATTRIBUTES', ProjectionExpression:/);
});

test('書き込みは問い合わせの行だけ（本体の表の家計簿の行を書き換えない）', () => {
  const writes = [...read('../../lib/reads.mjs').matchAll(/new cmd\.UpdateItemCommand\(\{([\s\S]*?)\}\)\)/g)];
  assert.equal(writes.length, 1);
  assert.match(writes[0][1], /ConditionExpression: 'attribute_exists\(SK\) AND begins_with\(SK, :inq\)'/);
  assert.match(writes[0][1], /':inq': \{ S: 'INQUIRY#' \}/);
});

test('家計データのテーブルには書けず、読めるのは日付の項目だけ', () => {
  const upd = tpl.slice(tpl.indexOf('Action: dynamodb:UpdateItem'));
  assert.doesNotMatch(upd.slice(0, upd.indexOf('- Effect')), /table\/\$\{TableName\}/);
  const main = tpl.match(/Resource: !Sub arn:aws:dynamodb:\$\{AWS::Region\}:\$\{AWS::AccountId\}:table\/\$\{TableName\}\n[\s\S]*?dynamodb:Attributes: \[([^\]]*)\]/);
  assert.deepEqual(main[1].split(', '), ['PK', 'SK', 'updatedAt', 'lastSeen', 'createdAt']);
});
