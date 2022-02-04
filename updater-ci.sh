#!/bin/bash

cd ./github_stars
./wget_github_stars.sh

cd ../qiita_lgtm
node ./puppeteer_qiita.js

cd ../bookmeter_wish
node ./puppeteer_bookmeter.js
./is_in_sophia.sh

cd ../boundhub
node ./puppeteer_boundhub.js
bash ./get_url_list.sh

cd ../note_favs
node ./puppeteer_note.js

# cd ../teratail_clip
# ./wget_teratail_clip.sh

cd ../zenn_favs
node ./puppeteer_zenn.js
