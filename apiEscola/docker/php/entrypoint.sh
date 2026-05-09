#!/bin/bash

set -e

# Garante que os diretórios essenciais do storage existam
# (necessário quando storage/app/public é um volume externo vazio)
mkdir -p /var/www/storage/app/public
mkdir -p /var/www/storage/framework/{sessions,views,cache}
mkdir -p /var/www/storage/logs

# Corrige permissões em runtime
# (volume mount sobrescreve as permissões definidas no build)
chown -R www-data:www-data /var/www/storage /var/www/bootstrap/cache
chmod -R 775 /var/www/storage
chmod -R 775 /var/www/bootstrap/cache

# Cria o symlink public/storage -> storage/app/public se ainda não existir
if [ ! -L /var/www/public/storage ]; then
    php artisan storage:link --quiet
fi

exec "$@"
