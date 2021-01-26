#!/bin/bash

node ./puppeteer_qiita.js
cat data.json | jq \
# jqでjsonをcsvに加工
> qiita_lgtm.csv