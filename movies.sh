#!/bin/bash
pushd   /home/giovortu/bin/mdb
/usr/bin/python3  ./movies.py --host 0.0.0.0  & #>>  /home/giovortu/bin/mdb/movies.log  2>&1 &
echo "QUI"
sleep 1
exit 0
