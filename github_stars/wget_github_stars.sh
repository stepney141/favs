#!/bin/bash
SECONDS=0

echo "full_name,html_url,description,stargazers_count" \
> starred_repos.csv && \
wget --no-check-certificate \
    --header="Accept: application/vnd.github.v3+json" \
    -q -O - \
    https://api.github.com/users/stepney141/starred\?per_page=100\&page={1..10} \
    | jq add -s \
    | jq '.[] | [ .full_name, .html_url, .description, .stargazers_count ] | @csv' -r \
>> starred_repos.csv

echo "GitHub Starred Repositories: CSV Output Completed!"
echo "The processing took $SECONDS seconds"
