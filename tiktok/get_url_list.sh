#!/bin/bash

# Video URLsを抽出
cat ./tiktok_faved_movies.csv | q -d , -H 'SELECT url FROM - WHERE type = "video"' > tiktok_video_urls.txt

# Photo URLsを抽出  
cat ./tiktok_faved_movies.csv | q -d , -H 'SELECT url FROM - WHERE type = "photo"' > tiktok_photo_urls.txt

# 全URLsを抽出（従来の形式も維持）
cat ./tiktok_faved_movies.csv | q -d , -H 'SELECT url FROM -' > tiktok_url_list.txt
