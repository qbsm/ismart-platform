#!/bin/bash

# Скрипт для тестирования редиректов из htaccess
# Использование: ./scripts/test-htaccess.sh [URL]
# Пример: ./scripts/test-htaccess.sh https://www.example.com

if [ -z "$1" ]; then
  echo "Использование: $0 [URL]"
  echo "Пример: $0 https://www.example.com"
  exit 1
fi

URL="$1"
echo "Тестирование URL: $URL"
echo "======================="

# Проверяем с опцией -I для отображения только заголовков
echo "Статус-код и заголовки (без проверки SSL):"
curl -I -L -s -k "$URL" | grep -E "^HTTP|^Location|^Server"
echo ""

# Проверяем с опцией -v для подробного вывода 
echo "Подробная информация о редиректах (без проверки SSL):"
curl -v -L -s -k "$URL" 2>&1 | grep -E "^> GET|^< HTTP|^< Location|SSL|certificate" | sort
echo ""

# Проверка разрешения доменного имени
echo "Проверка DNS для $URL:"
domain=$(echo "$URL" | sed -E 's|^https?://||' | sed -E 's|/.*$||')
host "$domain" || echo "Ошибка разрешения имени $domain"
echo ""

# Проверка SSL сертификата
echo "Информация о SSL сертификате (если есть):"
if [[ "$URL" == https://* ]]; then
  domain=$(echo "$URL" | sed -E 's|^https?://||' | sed -E 's|/.*$||')
  echo "Проверка SSL сертификата для домена $domain:"
  openssl s_client -connect "$domain:443" -servername "$domain" </dev/null 2>/dev/null | openssl x509 -text | grep -E "Subject:|DNS:|Not Before:|Not After :|Issuer:"
else
  echo "URL не использует HTTPS"
fi

echo ""
echo "Завершено!" 