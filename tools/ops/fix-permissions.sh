#!/bin/bash

# Скрипт для установки корректных прав доступа на проект
# Использование: sudo bash scripts/fix-permissions.sh [PROJECT_DIR] [USER]
# Пример: sudo bash scripts/fix-permissions.sh /var/www/mysite.com myuser

# Настраиваемые параметры (можно передать аргументами)
PROJECT_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
OWNER="${2:-$(whoami)}"
GROUP="${3:-www-data}"

echo "Начинаю установку прав доступа..."
echo "  Каталог проекта: $PROJECT_DIR"
echo "  Владелец: $OWNER:$GROUP"

# Проверяем, что мы запускаемся от root или с sudo
if [[ $EUID -ne 0 ]]; then
   echo "Этот скрипт должен быть запущен от имени root или с sudo" 
   exit 1
fi

# Проверяем существование каталога проекта
if [ ! -d "$PROJECT_DIR" ]; then
    echo "Ошибка: Каталог проекта $PROJECT_DIR не существует!"
    exit 1
fi

echo "Устанавливаю владельца $OWNER:$GROUP для всех файлов и каталогов..."
find "$PROJECT_DIR" -not -path "*/node_modules*" -exec chown "$OWNER:$GROUP" {} \;

echo "Устанавливаю базовые права доступа..."
echo "ВНИМАНИЕ: node_modules исключена из обработки прав доступа"
# Каталоги: 755 (rwxr-xr-x)
find "$PROJECT_DIR" -type d -not -path "*/node_modules*" -exec chmod 755 {} \;

# Обычные файлы: 644 (rw-r--r--)
find "$PROJECT_DIR" -type f -not -path "*/node_modules*" -exec chmod 644 {} \;

echo "Устанавливаю специальные права для каталога logs..."
if [ -d "$PROJECT_DIR/logs" ]; then
  # Каталог logs: права на запись для пользователя и группы (775)
  chmod 775 "$PROJECT_DIR/logs"
  # Все подкаталоги в logs
  find "$PROJECT_DIR/logs" -type d -exec chmod 775 {} \;
  # Файлы в logs: права на запись для группы (664)
  find "$PROJECT_DIR/logs" -type f -exec chmod 664 {} \;
fi

echo "Устанавливаю исполняемые права для скриптов..."
# Делаем скрипты исполняемыми
if [ -d "$PROJECT_DIR/scripts" ]; then
  find "$PROJECT_DIR/scripts" -name "*.sh" -exec chmod 755 {} \;
fi

echo "Восстанавливаю права для webpack и других инструментов сборки..."
# Восстанавливаем исполняемые права для всех файлов в node_modules/.bin/
if [ -d "$PROJECT_DIR/node_modules/.bin" ]; then
    find "$PROJECT_DIR/node_modules/.bin" -type f -exec chmod 755 {} \;
fi
# Восстанавливаем исполняемые права для всех .js файлов в bin директориях node_modules
if [ -d "$PROJECT_DIR/node_modules" ]; then
    find "$PROJECT_DIR/node_modules" -type f -path "*/bin/*.js" -exec chmod 755 {} \;
    # Конкретно для webpack
    if [ -f "$PROJECT_DIR/node_modules/webpack/bin/webpack.js" ]; then
        chmod 755 "$PROJECT_DIR/node_modules/webpack/bin/webpack.js"
    fi
fi

echo "Корректирую права для символических ссылок..."
find "$PROJECT_DIR" -type l -not -path "*/node_modules*" -exec chown -h "$OWNER:$GROUP" {} \;

echo "Корректирую права для Git файлов..."
if [ -d "$PROJECT_DIR/.git" ]; then
  # Git каталоги
  find "$PROJECT_DIR/.git" -type d -exec chmod 755 {} \;
  # Git файлы
  find "$PROJECT_DIR/.git" -type f -exec chmod 644 {} \;
  # Git hooks должны быть исполняемыми
  if [ -d "$PROJECT_DIR/.git/hooks" ]; then
      find "$PROJECT_DIR/.git/hooks" -type f -exec chmod 755 {} \;
  fi
fi

echo "Корректирую права для SSH ключей..."
if [ -d "$PROJECT_DIR/.ssh" ]; then
    chmod 700 "$PROJECT_DIR/.ssh"
    find "$PROJECT_DIR/.ssh" -type f -name "id_*" -not -name "*.pub" -exec chmod 600 {} \;
    find "$PROJECT_DIR/.ssh" -type f -name "*.pub" -exec chmod 644 {} \;
    find "$PROJECT_DIR/.ssh" -type f -name "known_hosts*" -exec chmod 644 {} \;
    find "$PROJECT_DIR/.ssh" -type f -name "config" -exec chmod 600 {} \;
fi

echo "Устанавливаю права для Node.js кэша..."
if [ -d "$PROJECT_DIR/.npm" ]; then
    find "$PROJECT_DIR/.npm" -type d -exec chmod 755 {} \;
    find "$PROJECT_DIR/.npm" -type f -exec chmod 644 {} \;
fi

if [ -d "$PROJECT_DIR/.cache" ]; then
    find "$PROJECT_DIR/.cache" -type d -exec chmod 755 {} \;
    find "$PROJECT_DIR/.cache" -type f -exec chmod 644 {} \;
fi

echo "Устанавливаю права для конфигурационных файлов..."
if [ -d "$PROJECT_DIR/.config" ]; then
    find "$PROJECT_DIR/.config" -type d -exec chmod 755 {} \;
    find "$PROJECT_DIR/.config" -type f -exec chmod 644 {} \;
fi

if [ -d "$PROJECT_DIR/.local" ]; then
    find "$PROJECT_DIR/.local" -type d -exec chmod 755 {} \;
    find "$PROJECT_DIR/.local" -type f -exec chmod 644 {} \;
fi

# Специальные права для некоторых файлов
echo "Устанавливаю специальные права..."

# .htaccess файлы
find "$PROJECT_DIR" -name ".htaccess" -exec chmod 644 {} \;

# Приватные файлы
if [ -f "$PROJECT_DIR/.bash_history" ]; then
    chmod 600 "$PROJECT_DIR/.bash_history"
fi

if [ -f "$PROJECT_DIR/.gitconfig" ]; then
    chmod 644 "$PROJECT_DIR/.gitconfig"
fi

echo "Проверяю результат..."
echo "Права на основной каталог:"
ls -ld "$PROJECT_DIR"

if [ -d "$PROJECT_DIR/logs" ]; then
  echo "Права на каталог logs:"
  ls -ld "$PROJECT_DIR/logs"
fi

if [ -d "$PROJECT_DIR/scripts" ]; then
  echo "Права на каталог scripts:"
  ls -ld "$PROJECT_DIR/scripts"
fi

echo ""
echo "Установка прав доступа завершена успешно!"
echo "Все файлы и каталоги теперь принадлежат $OWNER:$GROUP"
