#!/bin/bash

cd ./github_stars
./wget_github_stars.sh

cd ../qiita_lgtm
node ./puppeteer_qiita.js

cd ../bookmeter_wish
node ./puppeteer_bookmeter.js
cat bookmeter_wish_books.csv | q -d, -H 'select * from - where exist_in_sophia="No"'> not_in_sophia.csv

cd ../boundhub
node ./puppeteer_boundhub.js
bash ./get_url_list.sh

cd ../note_favs
node ./puppeteer_note.js

cd ../teratail_clip
./wget_teratail_clip.sh

cd ../zenn_favs
node ./puppeteer_zenn.js

cd ..
date1="`date --iso-8601=minutes`"
git add .
git commit -m "updated: $date1"

git push origin master
