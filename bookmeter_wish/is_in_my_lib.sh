#!/bin/bash

base_columns="isbn_or_asin, book_title, author, publisher, published_date"

# 上智大
q -d, -O -H "SELECT $base_columns FROM ./bookmeter_wish_books.csv \
WHERE exist_in_Sophia='No' AND (book_title NOT LIKE 'Not_found_in%' OR book_title NOT LIKE 'INVALID_ISBN')"\
> not_in_Sophia.csv

q -d, -O -H "SELECT $base_columns, central_opac_link, mathlib_opac_link \
FROM ./bookmeter_wish_books.csv WHERE exist_in_Sophia='Yes'"\
> in_Sophia.csv

# 東大
q -d, -O -H "SELECT $base_columns FROM ./bookmeter_wish_books.csv \
WHERE exist_in_UTokyo='No' AND (book_title NOT LIKE 'Not_found_in%' OR book_title NOT LIKE 'INVALID_ISBN')"\
> not_in_UTokyo.csv

q -d, -O -H "SELECT $base_columns, central_opac_link FROM ./bookmeter_wish_books.csv \
WHERE exist_in_UTokyo='Yes' AND (book_title NOT LIKE 'Not_found_in%' OR book_title NOT LIKE 'INVALID_ISBN')"\
> in_UTokyo.csv

# 上智にあって東大にない
q -d, -O -H "SELECT $base_columns FROM ./bookmeter_wish_books.csv \
WHERE exist_in_Sophia='Yes' AND exist_in_UTokyo='No' AND (book_title NOT LIKE 'Not_found_in%' OR book_title NOT LIKE 'INVALID_ISBN')"\
> in_Sophia_but_not_in_UTokyo.csv

# 東大にあって上智にない
q -d, -O -H "SELECT $base_columns FROM ./bookmeter_wish_books.csv \
WHERE exist_in_Sophia='No' AND exist_in_UTokyo='Yes' AND (book_title NOT LIKE 'Not_found_in%' OR book_title NOT LIKE 'INVALID_ISBN')"\
> in_UTokyo_but_not_in_Sophia.csv

# 上智にも東大にもない
q -d, -O -H "SELECT $base_columns, exist_in_Sophia, exist_in_UTokyo FROM ./bookmeter_wish_books.csv \
WHERE exist_in_Sophia='No' AND exist_in_UTokyo='No' AND (book_title NOT LIKE 'Not_found_in%' OR book_title NOT LIKE 'INVALID_ISBN')"\
> not_in_Sophia_and_UTokyo.csv
