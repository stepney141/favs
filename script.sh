#!/bin/bash
echo "full_name,html_url,description" \
> starred_repos.csv && \
wget --no-check-certificate \
    --header="Accept: application/vnd.github.v3+json" \
    -q -O - \
    https://api.github.com/users/stepney141/starred\?per_page=100\&page={1..3} \
    | jq add -s \
    | jq '.[] | [ .full_name, .html_url, .description ] | @csv' -r \
>> starred_repos.csv

git add .
git commit -m "updated starred_repos.csv"
git push origin
