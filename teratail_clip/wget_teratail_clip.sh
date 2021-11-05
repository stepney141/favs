#!/bin/bash
SECONDS=0

eval "$(cat ../.env <(echo) <(declare -x))" 
# .envファイルのアクセストークンを読み込む（相対パスの参照の仕方に注意）
# ref: https://qiita.com/mpyw/items/6d43d584c7e24d40af7b

echo "title,html_url" > teratail_clip.csv && \
# wget --no-check-certificate \
#     --header="Authorization: Bearer ${TERATAIL_API_TOKEN}" \
#     -d -O - \
#     https://teratail.com/api/v1/users/stepney141/clips?limit=100 \
curl --silent \
    -X GET https://teratail.com/api/v1/users/stepney141/clips?limit=100 \
    -H "Authorization: Bearer ${TERATAIL_API_TOKEN}" \
| jq '.questions[] | [ .title, "https://teratail.com/questions/" + (.id|tostring)] | @csv' -r \
>> teratail_clip.csv

echo "Teratail Clipped Questions: CSV Output Completed!"
echo "The processing took $SECONDS seconds"
