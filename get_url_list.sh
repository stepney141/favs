#!/bin/bash

# cat ./boundhub_faved_movies.csv \
# | tail -n +2 \
# | while read line || [[ -n "${line}" ]]
# do
#   echo `echo ${line} | cut -d , -f 2`
# done > boundhub_url_list.txt

## 4行目のtailは先頭のヘッダ行を無視するために使う
## 最終行の末尾に改行文字がないと、readは最終行を読み取ってくれない（＝while read lineがfalseを返す）ので、改行がなくてもtrueを返すようにしてもらう
## ref: https://genzouw.com/entry/2020/04/15/140408/1972/
## ループに入る前にパイプで awk 1 を通しておき、awkに改行文字を付け加えてもらうことでも実現可能

# ========== #

cat ./boundhub_faved_movies.csv | q -d , -H 'SELECT url FROM -' > boundhub_url_list.txt
