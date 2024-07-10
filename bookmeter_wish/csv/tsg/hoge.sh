#!/bin/bash

SOURCE=$1

cat $1 | csvq -f csv "select bookmeter_url, isbn_or_asin, book_title, author, publisher, published_date, exist_in_UTokyo, utokyo_opac" > tmp.txt 
cat tmp.txt > $1
rm tmp.txt

