#!/bin/sh
set -eu

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<EOSQL
CREATE DATABASE IF NOT EXISTS moonsconfig_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON moonsconfig_platform.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
EOSQL
