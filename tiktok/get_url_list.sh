#!/bin/bash

cat ./tiktok_faved_movies.csv | q -d , -H 'SELECT url FROM -' > tiktok_url_list.txt

