#!/bin/bash

cat ./nicoseiga_myclips.csv | q -d , -H 'SELECT url FROM -' > nicoseiga_url_list.txt
