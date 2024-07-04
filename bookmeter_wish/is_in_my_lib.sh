#!/bin/bash

source_from="FROM ./csv/bookmeter_wish_books.csv"
base_columns="isbn_or_asin, book_title, author, publisher, published_date"
filter_book_title_error="(book_title NOT LIKE 'Not_found_in%' AND book_title NOT LIKE '%INVALID_ISBN%')"

# 上智大
q -d, -O -H "SELECT $base_columns \
$source_from \
WHERE exist_in_Sophia='No' AND $filter_book_title_error"\
> ./csv/not_in_Sophia.csv

q -d, -O -H "SELECT $base_columns, sophia_opac, sophia_mathlib_opac \
$source_from \
WHERE exist_in_Sophia='Yes'"\
> ./csv/in_Sophia.csv

# 東大
q -d, -O -H "SELECT $base_columns \
$source_from \
WHERE exist_in_UTokyo='No' AND $filter_book_title_error"\
> ./csv/not_in_UTokyo.csv

q -d, -O -H "SELECT $base_columns, utokyo_opac \
$source_from \
WHERE exist_in_UTokyo='Yes' AND $filter_book_title_error"\
> ./csv/in_UTokyo.csv

# 上智にあって東大にない
q -d, -O -H "SELECT $base_columns, sophia_opac \
$source_from \
WHERE exist_in_Sophia='Yes' AND exist_in_UTokyo='No' AND $filter_book_title_error"\
> ./csv/in_Sophia_but_not_in_UTokyo.csv

# 東大にあって上智にない
q -d, -O -H "SELECT $base_columns, utokyo_opac \
$source_from \
WHERE exist_in_Sophia='No' AND exist_in_UTokyo='Yes' AND $filter_book_title_error"\
> ./csv/in_UTokyo_but_not_in_Sophia.csv

# 上智にも東大にもない
q -d, -O -H "SELECT $base_columns \
$source_from \
WHERE exist_in_Sophia='No' AND exist_in_UTokyo='No' AND $filter_book_title_error"\
> ./csv/not_in_Sophia_and_UTokyo.csv
